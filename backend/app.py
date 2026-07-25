import os
import re
import math
from datetime import datetime, date, time, timedelta
from io import BytesIO
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, send_file
import pymysql
from pymysql.cursors import DictCursor
import pytz
from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Alignment
from openpyxl.worksheet.datavalidation import DataValidation
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
TEMPLATES_DIR = os.path.join(PROJECT_ROOT, 'frontend', 'templates')
STATIC_DIR = os.path.join(PROJECT_ROOT, 'frontend', 'static')

app = Flask(
    __name__,
    template_folder=TEMPLATES_DIR,
    static_folder=STATIC_DIR
)
app.secret_key = os.urandom(24)

# --- Old configuration kept ---
DB_CONFIG = {
    "host": "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
    "port": 4000,
    "user": "3dtXqyjkbNdTH2t.root",
    "password": "vzuHZOlyqLj195LO",
    "database": "defaultdb",
    "charset": "utf8mb4",
    "cursorclass": DictCursor,
    "autocommit": True,
    "ssl_verify_cert": True,
    "ssl_verify_identity": True,
    "ssl_ca": os.path.join(BASE_DIR, "isrgrootx1.pem")
}

ADMIN_CODE = 'admin1246'

COLLEGE_LAT = 19.18748
COLLEGE_LON = 72.97282
GPS_RADIUS_METERS = 200

IST = pytz.timezone('Asia/Kolkata')
def haversine(lat1, lon1, lat2, lon2):
    R = 6371000  # Earth radius in metres

    lat1 = math.radians(lat1)
    lon1 = math.radians(lon1)
    lat2 = math.radians(lat2)
    lon2 = math.radians(lon2)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c

def get_db_connection():
    try:
        return pymysql.connect(**DB_CONFIG)
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        return None

# --- Auto-Absent (10:01 PM IST) ---
def mark_absent_students():
    today = datetime.now(IST).date()
    conn = get_db_connection()
    if not conn:
        return
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT registration_number FROM registrations")
            all_students = [row['registration_number'] for row in cur.fetchall()]
            cur.execute("SELECT registration_number FROM attendance WHERE date = %s", (today,))
            present_today = [row['registration_number'] for row in cur.fetchall()]
            absent_students = set(all_students) - set(present_today)
            now_time = datetime.now(IST).time()
            for reg_num in absent_students:
                cur.execute(
                    "INSERT INTO attendance (registration_number, date, time_in, status, device_fingerprint) VALUES (%s, %s, %s, %s, %s)",
                    (reg_num, today, now_time, 'Absent', 'auto_absent')
                )
            conn.commit()
            print(f"✅ Marked {len(absent_students)} students as Absent for {today}")
    except Exception as e:
        print(f"❌ Auto-absent error: {e}")
    finally:
        conn.close()

# --- Helper: Convert timedelta to string ---
def timedelta_to_str(td):
    if td is None:
        return ''
    if isinstance(td, timedelta):
        total_seconds = int(td.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return str(td)

# --- Helper: Get interval status ---
def get_interval_status(current_time):
    """Determine which interval the current time falls into (1-4 for 8-12)"""
    hour = current_time.hour
    if 8 <= hour < 9:
        return 1
    elif 9 <= hour < 10:
        return 2
    elif 10 <= hour < 11:
        return 3
    elif 11 <= hour < 12:
        return 4
    return None

# --- Helper: Get month calendar data ---
def get_month_calendar(reg_number, year, month):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT date, status FROM attendance 
                WHERE registration_number = %s AND YEAR(date) = %s AND MONTH(date) = %s
            """, (reg_number, year, month))
            records = cur.fetchall()
            attendance_map = {row['date'].day: row['status'] for row in records}
            return attendance_map
    finally:
        conn.close()

# --- Helper: Get dashboard stats ---
def get_dashboard_stats(reg_number):
    conn = get_db_connection()
    if not conn:
        return {'present': 0, 'absent': 0, 'working_days': 0}
    try:
        with conn.cursor() as cur:
            today = datetime.now(IST).date()
            first_day = today.replace(day=1)
            cur.execute("""
                SELECT COUNT(*) as total_working_days FROM attendance 
                WHERE registration_number = %s AND date BETWEEN %s AND %s
            """, (reg_number, first_day, today))
            total_days = cur.fetchone()
            
            cur.execute("""
                SELECT COUNT(CASE WHEN status IN ('Present', 'Late') THEN 1 END) as present,
                       COUNT(CASE WHEN status = 'Absent' THEN 1 END) as absent
                FROM attendance 
                WHERE registration_number = %s AND date BETWEEN %s AND %s
            """, (reg_number, first_day, today))
            stats = cur.fetchone()
            
            # Working days excluding Sundays
            working_days = 0
            for d in range((today - first_day).days + 1):
                current_date = first_day + timedelta(days=d)
                if current_date.weekday() != 6:
                    working_days += 1
            
            return {
                'present': stats.get('present', 0) if stats else 0,
                'absent': stats.get('absent', 0) if stats else 0,
                'working_days': working_days
            }
    finally:
        conn.close()

# --- Routes ---

@app.route('/')
def index():
    if session.get('student_logged_in'):
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        data = request.get_json()
        name = data.get('name', '').strip()
        reg_num = data.get('registration_number', '').strip()
        mobile = data.get('mobile', '').strip()
        year = data.get('year', '').strip()
        password = data.get('password', '').strip()

        # Admin shortcut
        if reg_num.lower() == ADMIN_CODE:
            session['admin_logged_in'] = True
            return jsonify({'success': True, 'redirect': '/admin', 'message': 'Admin access granted!'}), 200

        if not all([name, reg_num, mobile, year, password]):
            return jsonify({'success': False, 'message': 'All fields are required.'}), 400
        if len(mobile) != 10 or not mobile.isdigit():
            return jsonify({'success': False, 'message': 'Mobile must be exactly 10 digits.'}), 400
        if year not in ['FYBCA', 'SYBCA', 'TYBCA']:
            return jsonify({'success': False, 'message': 'Invalid year.'}), 400
        if len(password) < 6:
            return jsonify({'success': False, 'message': 'Password must be at least 6 characters.'}), 400

        conn = get_db_connection()
        if not conn:
            return jsonify({'success': False, 'message': 'Database connection failed.'}), 500
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM registrations WHERE registration_number = %s", (reg_num,))
                if cur.fetchone():
                    return jsonify({'success': False, 'message': 'Registration number already exists.'}), 400
                cur.execute("SELECT id FROM registrations WHERE mobile = %s", (mobile,))
                if cur.fetchone():
                    return jsonify({'success': False, 'message': 'Mobile number already registered.'}), 400

                cur.execute(
                    "INSERT INTO registrations (registration_number, name, mobile, year, password) VALUES (%s, %s, %s, %s, %s)",
                    (reg_num, name, mobile, year, password)
                )
                conn.commit()
                
                session['student_logged_in'] = True
                session['registration_number'] = reg_num
                session['student_name'] = name
                
                return jsonify({'success': True, 'redirect': '/dashboard', 'message': 'Signup successful!'})
        except pymysql.IntegrityError as e:
            return jsonify({'success': False, 'message': 'Database error: ' + str(e)}), 400
        finally:
            conn.close()
    
    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.get_json()
        reg_num = data.get('registration_number', '').strip()
        password = data.get('password', '').strip()

        if reg_num.lower() == ADMIN_CODE:
            session['admin_logged_in'] = True
            return jsonify({'success': True, 'redirect': '/admin', 'message': 'Admin access granted!'}), 200

        if not reg_num or not password:
            return jsonify({'success': False, 'message': 'Registration Number and Password are required.'}), 400

        conn = get_db_connection()
        if not conn:
            return jsonify({'success': False, 'message': 'Database connection failed.'}), 500
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT registration_number, name, password FROM registrations WHERE registration_number = %s", (reg_num,))
                student = cur.fetchone()
                if not student:
                    return jsonify({'success': False, 'message': 'Registration ID invalid.'}), 400
                if student['password'] != password:
                    return jsonify({'success': False, 'message': 'Password invalid.'}), 400

                session['student_logged_in'] = True
                session['registration_number'] = student['registration_number']
                session['student_name'] = student['name']
                
                return jsonify({'success': True, 'redirect': '/dashboard', 'message': 'Login successful!'})
        finally:
            conn.close()
    
    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    if not session.get('student_logged_in'):
        return redirect(url_for('login'))
    
    reg_number = session['registration_number']
    stats = get_dashboard_stats(reg_number)
    
    today = datetime.now(IST).date()
    current_month = today.month
    current_year = today.year
    
    return render_template('dashboard.html', 
                         student_name=session['student_name'],
                         reg_number=reg_number,
                         stats=stats,
                         current_month=current_month,
                         current_year=current_year)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/profile')
def profile():
    if not session.get('student_logged_in'):
        return redirect(url_for('login'))
    
    reg_number = session['registration_number']
    conn = get_db_connection()
    if not conn:
        return render_template('profile.html', student_name=session['student_name'], reg_number=reg_number, student_data={})
    
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM registrations WHERE registration_number = %s", (reg_number,))
            student_data = cur.fetchone()
        return render_template('profile.html', 
                             student_name=session['student_name'],
                             reg_number=reg_number,
                             student_data=student_data)
    finally:
        conn.close()

@app.route('/calendar_data')
def calendar_data():
    if not session.get('student_logged_in'):
        return jsonify({'success': False, 'message': 'Not logged in.'}), 401
    
    year = request.args.get('year', type=int, default=datetime.now(IST).year)
    month = request.args.get('month', type=int, default=datetime.now(IST).month)
    
    reg_number = session['registration_number']
    attendance_map = get_month_calendar(reg_number, year, month)
    
    calendar_data = {}
    for day, status in attendance_map.items():
        calendar_data[str(day)] = status
    
    return jsonify({'success': True, 'data': calendar_data})

@app.route('/attendance_page')
def attendance_page():
    if not session.get('student_logged_in'):
        return redirect(url_for('login'))
    return render_template('attendance_form.html')

# --- Admin Routes ---

@app.route('/admin', methods=['GET', 'POST'])
def admin_panel():
    if request.method == 'POST':
        password = request.form.get('password')
        if password == '1246':
            session['admin_logged_in'] = True
            return redirect(url_for('admin_panel'))
        else:
            return render_template('admin.html', error="Wrong password")
    if not session.get('admin_logged_in'):
        return render_template('admin.html', error=None)
    
    conn = get_db_connection()
    registrations = []
    total_registrations = 0
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM registrations ORDER BY registered_at DESC")
                registrations = cur.fetchall()
                total_registrations = len(registrations)
        finally:
            conn.close()
    
    return render_template('admin.html', registrations=registrations, total_registrations=total_registrations)

@app.route('/admin/search')
def admin_search():
    if not session.get('admin_logged_in'):
        return jsonify({'success': False, 'message': 'Not authorized.'}), 401
    
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'success': True, 'data': []})
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'success': False, 'message': 'Database connection failed.'}), 500
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM registrations 
                WHERE name LIKE %s OR registration_number LIKE %s
                ORDER BY registered_at DESC
            """, (f'%{query}%', f'%{query}%'))
            results = cur.fetchall()
            return jsonify({'success': True, 'data': results})
    finally:
        conn.close()

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_logged_in', None)
    return redirect(url_for('index'))

@app.route('/admin/reset_password', methods=['POST'])
def admin_reset_password():
    if not session.get('admin_logged_in'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    
    data = request.json
    reg_number = data.get('registration_number')
    new_password = data.get('new_password', '123456').strip()
    
    if not new_password or len(new_password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters'})
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE registrations SET password = %s WHERE registration_number = %s", 
                       (new_password, reg_number))
        return jsonify({'success': True, 'new_password': new_password})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        conn.close()

@app.route('/admin/delete_student', methods=['POST'])
def admin_delete_student():
    if not session.get('admin_logged_in'):
        return jsonify({'success': False, 'message': 'Unauthorized'})
    
    data = request.json
    reg_number = data.get('registration_number')
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM registrations WHERE registration_number = %s", (reg_number,))
            cur.execute("DELETE FROM attendance WHERE registration_number = %s", (reg_number,))
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        conn.close()

# --- Attendance API ---

@app.route('/mark_attendance', methods=['POST'])
def mark_attendance():
    data = request.get_json()
    registration_number = data.get('registration_number', '').strip()
    year = data.get('year', '').strip()
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    device_fingerprint = data.get('device_fingerprint', '').strip()

    if registration_number.lower() == ADMIN_CODE:
        session['admin_logged_in'] = True
        return jsonify({'success': True, 'redirect': '/admin', 'message': 'Admin access granted!'}), 200

    if not session.get('student_logged_in'):
        return jsonify({'success': False, 'message': 'Please login first.'}), 401

    if registration_number != session['registration_number']:
        return jsonify({'success': False, 'message': 'You can only mark your own attendance.'}), 400

    if not all([registration_number, year]):
        return jsonify({'success': False, 'message': 'Registration Number and Year are required.'}), 400
    if year not in ['FYBCA', 'SYBCA', 'TYBCA']:
        return jsonify({'success': False, 'message': 'Invalid year.'}), 400
    if latitude is None or longitude is None:
        return jsonify({'success': False, 'message': 'Location access is required.'}), 400
    if not device_fingerprint:
        return jsonify({'success': False, 'message': 'Device fingerprint not available.'}), 400

    distance = haversine(COLLEGE_LAT, COLLEGE_LON, float(latitude), float(longitude))
    if distance > GPS_RADIUS_METERS:
        return jsonify({'success': False, 'message': f'You are not within college campus. Distance: {int(distance)} meters.'}), 400

    now = datetime.now(IST)
    current_time = now.time()
    current_date = now.date()

    # Check if within attendance window
    if current_time < time(8, 0):
        return jsonify({'success': False, 'message': 'Attendance window starts at 8:00 AM IST.'}), 400
    if current_time >= time(12, 0):
        return jsonify({'success': False, 'message': 'Attendance window closed at 12:00 PM IST.'}), 400

    # Get current interval
    interval = get_interval_status(current_time)
    if interval is None:
        return jsonify({'success': False, 'message': 'Invalid attendance interval.'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'success': False, 'message': 'Database connection failed.'}), 500
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT year FROM registrations WHERE registration_number = %s", (registration_number,))
            student = cur.fetchone()
            if not student:
                return jsonify({'success': False, 'message': 'Invalid Registration Number.'}), 400
            if student['year'] != year:
                return jsonify({'success': False, 'message': f"Student is in {student['year']}, not {year}."}), 400

            # Check if attendance already marked for this interval
            cur.execute("""
                SELECT id FROM attendance 
                WHERE registration_number = %s AND date = %s AND interval_number = %s
            """, (registration_number, current_date, interval))
            if cur.fetchone():
                return jsonify({'success': False, 'message': f'Attendance already marked for interval {interval} (hour {interval + 7}).'}), 400

            # Prevent device reuse for same interval
            cur.execute("""
                SELECT registration_number FROM attendance 
                WHERE device_fingerprint = %s AND date = %s AND interval_number = %s
            """, (device_fingerprint, current_date, interval))
            existing = cur.fetchone()
            if existing and existing['registration_number'] != registration_number:
                return jsonify({'success': False, 'message': f'This device has already been used for interval {interval} today.'}), 400

            # Record attendance for current interval
            cur.execute("""
                INSERT INTO attendance 
                (registration_number, date, time_in, status, device_fingerprint, interval_number) 
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (registration_number, current_date, current_time, 'Present', device_fingerprint, interval))
            conn.commit()
            
            return jsonify({
                'success': True, 
                'message': f'Attendance marked for interval {interval} (hour {interval + 7}:00 - {interval + 8}:00).', 
                'interval': interval,
                'status': 'Present'
            })
    finally:
        conn.close()

# Add new route to get student's attendance status for today
@app.route('/get_daily_attendance_status')
def get_daily_attendance_status():
    if not session.get('student_logged_in'):
        return jsonify({'success': False, 'message': 'Not logged in.'}), 401
    
    registration_number = session['registration_number']
    current_date = datetime.now(IST).date()
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'success': False, 'message': 'Database connection failed.'}), 500
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT interval_number, time_in, status 
                FROM attendance 
                WHERE registration_number = %s AND date = %s
                ORDER BY interval_number
            """, (registration_number, current_date))
            records = cur.fetchall()
            
            attendance_status = {}
            for record in records:
                interval = record['interval_number']
                time_in = record['time_in']
                
                # Convert timedelta to string format
                if isinstance(time_in, timedelta):
                    total_seconds = int(time_in.total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    seconds = total_seconds % 60
                    time_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                elif isinstance(time_in, time):
                    time_str = time_in.strftime('%H:%M:%S')
                else:
                    time_str = str(time_in) if time_in else ''
                
                attendance_status[interval] = {
                    'time_in': time_str,
                    'status': record['status']
                }
            
            return jsonify({
                'success': True,
                'attendance_status': attendance_status,
                'marked_intervals': list(attendance_status.keys())
            })
    finally:
        conn.close()

# Add the admin route for viewing student interval records
@app.route('/admin/student_interval_records')
def admin_student_interval_records():
    if not session.get('admin_logged_in'):
        return jsonify({'success': False, 'message': 'Not authorized'}), 401
    
    reg_number = request.args.get('reg_number', '').strip()
    current_date = datetime.now(IST).date()
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'success': False, 'message': 'Database connection failed'}), 500
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT interval_number, time_in, status 
                FROM attendance 
                WHERE registration_number = %s AND date = %s
                ORDER BY interval_number
            """, (reg_number, current_date))
            records = cur.fetchall()
            
            interval_records = {}
            for record in records:
                interval = record['interval_number']
                time_in = record['time_in']
                
                # Convert timedelta to string format
                if isinstance(time_in, timedelta):
                    total_seconds = int(time_in.total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    seconds = total_seconds % 60
                    time_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                elif isinstance(time_in, time):
                    time_str = time_in.strftime('%H:%M:%S')
                else:
                    time_str = str(time_in) if time_in else ''
                
                interval_records[interval] = {
                    'time_in': time_str,
                    'status': record['status']
                }
            
            return jsonify({
                'success': True,
                'records': interval_records
            })
    finally:
        conn.close()

# --- Scheduler ---
scheduler = BackgroundScheduler()
scheduler.add_job(
    mark_absent_students,
    'cron',
    hour=22,
    minute=1,
    timezone=IST
)
scheduler.start()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

@app.route('/get_session_data')
def get_session_data():
    if session.get('student_logged_in'):
        return jsonify({
            'registration_number': session.get('registration_number'),
            'student_name': session.get('student_name')
        })
    return jsonify({'success': False})
