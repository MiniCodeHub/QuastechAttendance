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
from openpyxl.styles import Alignment, Font, PatternFill
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

# --- Database Configuration ---
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

# --- Helper Functions ---

def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance between two GPS coordinates in meters"""
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
    """Get database connection"""
    try:
        return pymysql.connect(**DB_CONFIG)
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        return None

def mark_absent_students():
    """Mark absent students automatically at 10 PM"""
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

def get_month_calendar(reg_number, year, month):
    """Get attendance data for a specific month"""
    conn = get_db_connection()
    if not conn:
        return {}
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

def get_dashboard_stats(reg_number):
    """Get dashboard statistics for a student"""
    conn = get_db_connection()
    if not conn:
        return {'present': 0, 'absent': 0, 'working_days': 0}
    try:
        with conn.cursor() as cur:
            today = datetime.now(IST).date()
            first_day = today.replace(day=1)
            
            cur.execute("""
                SELECT COUNT(CASE WHEN status IN ('Present', 'Late') THEN 1 END) as present,
                       COUNT(CASE WHEN status = 'Absent' THEN 1 END) as absent
                FROM attendance 
                WHERE registration_number = %s AND date BETWEEN %s AND %s
            """, (reg_number, first_day, today))
            stats = cur.fetchone()
            
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

# --- PUBLIC ROUTES ---

@app.route('/')
def index():
    """Home page"""
    if session.get('student_logged_in'):
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    """Student signup route"""
    if request.method == 'POST':
        # Handle both form data and JSON
        if request.is_json:
            data = request.get_json()
            name = data.get('name', '').strip()
            registration_number = data.get('registration_number', '').strip()
            mobile = data.get('mobile', '').strip()
            year = data.get('year', '').strip()
            course = data.get('course', '').strip()
            password = data.get('password', '').strip()
            confirm_password = data.get('confirm_password', '').strip()
        else:
            name = request.form.get('name', '').strip()
            registration_number = request.form.get('registration_number', '').strip()
            mobile = request.form.get('mobile', '').strip()
            year = request.form.get('year', '').strip()
            course = request.form.get('course', '').strip()
            password = request.form.get('password', '').strip()
            confirm_password = request.form.get('confirm_password', '').strip()

        # Convert year to display format
        year_map = {'1': 'FYBCA', '2': 'SYBCA', '3': 'TYBCA'}
        year_value = year_map.get(year, year).strip()

        # Validation
        if not all([name, registration_number, mobile, year_value, password, confirm_password]):
            error_msg = 'All fields are required'
            if request.is_json:
                return jsonify({'success': False, 'message': error_msg})
            return render_template('signup.html', error=error_msg)

        if year_value not in {'FYBCA', 'SYBCA', 'TYBCA'}:
            error_msg = 'Invalid year'
            if request.is_json:
                return jsonify({'success': False, 'message': error_msg})
            return render_template('signup.html', error=error_msg)

        if password != confirm_password:
            error_msg = 'Passwords do not match'
            if request.is_json:
                return jsonify({'success': False, 'message': error_msg})
            return render_template('signup.html', error=error_msg)

        if len(password) < 6:
            error_msg = 'Password must be at least 6 characters'
            if request.is_json:
                return jsonify({'success': False, 'message': error_msg})
            return render_template('signup.html', error=error_msg)

        if len(mobile) != 10 or not mobile.isdigit():
            error_msg = 'Mobile number must be 10 digits'
            if request.is_json:
                return jsonify({'success': False, 'message': error_msg})
            return render_template('signup.html', error=error_msg)

        conn = get_db_connection()
        if not conn:
            error_msg = 'Database connection failed'
            if request.is_json:
                return jsonify({'success': False, 'message': error_msg})
            return render_template('signup.html', error=error_msg)

        try:
            with conn.cursor() as cur:
                # Check if registration number exists
                cur.execute(
                    'SELECT * FROM registrations WHERE registration_number = %s',
                    (registration_number,)
                )
                if cur.fetchone():
                    error_msg = 'Registration number already exists'
                    if request.is_json:
                        return jsonify({'success': False, 'message': error_msg})
                    return render_template('signup.html', error=error_msg)

                # Insert new student
                cur.execute("""
                    INSERT INTO registrations 
                    (name, registration_number, mobile, year, course, password, registered_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (name, registration_number, mobile, year_value, course, password, datetime.now(IST)))

                conn.commit()
                
                if request.is_json:
                    return jsonify({
                        'success': True, 
                        'message': 'Account created successfully!',
                        'redirect': url_for('login')
                    })
                return redirect(url_for('login'))
                
        except Exception as e:
            print(f"Signup error: {e}")
            error_msg = 'An error occurred. Please try again.'
            if request.is_json:
                return jsonify({'success': False, 'message': error_msg})
            return render_template('signup.html', error=error_msg)
        finally:
            conn.close()

    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Student login route"""
    if request.method == 'POST':
        # Handle both form data and JSON
        if request.is_json:
            data = request.get_json()
            registration_number = data.get('registration_number', '').strip()
            password = data.get('password', '').strip()
        else:
            registration_number = request.form.get('registration_number', '').strip()
            password = request.form.get('password', '').strip()

        # Validation
        if not registration_number or not password:
            error_msg = 'Registration number and password are required'
            if request.is_json or request.headers.get('Accept') == 'application/json':
                return jsonify({'success': False, 'message': error_msg})
            return render_template('login.html', error=error_msg)

        # Check if admin
        if registration_number == 'admin' and password == '1246':
            session['admin_logged_in'] = True
            if request.is_json or request.headers.get('Accept') == 'application/json':
                return jsonify({
                    'success': True,
                    'message': 'Admin login successful!',
                    'redirect': '/admin',  # ✅ CHANGED: Direct URL instead of url_for()
                    'is_admin': True
                })
            return redirect('/admin')  # ✅ CHANGED: Direct URL instead of url_for()

        # Continue with student login...
        conn = get_db_connection()
        if not conn:
            error_msg = 'Database connection failed'
            if request.is_json or request.headers.get('Accept') == 'application/json':
                return jsonify({'success': False, 'message': error_msg})
            return render_template('login.html', error=error_msg)

        try:
            with conn.cursor() as cur:
                # Check if user exists
                cur.execute(
                    'SELECT * FROM registrations WHERE registration_number = %s',
                    (registration_number,)
                )
                user = cur.fetchone()

                if not user:
                    error_msg = 'Invalid registration number or password'
                    if request.is_json or request.headers.get('Accept') == 'application/json':
                        return jsonify({'success': False, 'message': error_msg})
                    return render_template('login.html', error=error_msg)

                # Check password
                if user['password'] != password:
                    error_msg = 'Invalid registration number or password'
                    if request.is_json or request.headers.get('Accept') == 'application/json':
                        return jsonify({'success': False, 'message': error_msg})
                    return render_template('login.html', error=error_msg)

                # Set session variables
                session['user_id'] = user['id']
                session['registration_number'] = user['registration_number']
                session['student_name'] = user['name']
                session['student_logged_in'] = True

                # Return JSON response or redirect
                if request.is_json or request.headers.get('Accept') == 'application/json':
                    return jsonify({
                        'success': True,
                        'message': 'Login successful!',
                        'redirect': url_for('dashboard')
                    })
                
                return redirect(url_for('dashboard'))

        except Exception as e:
            print(f"Login error: {e}")
            error_msg = 'An error occurred. Please try again.'
            if request.is_json or request.headers.get('Accept') == 'application/json':
                return jsonify({'success': False, 'message': error_msg})
            return render_template('login.html', error=error_msg)
        finally:
            conn.close()

    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    """Student dashboard"""
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
    """Logout route"""
    session.clear()
    return redirect(url_for('index'))

@app.route('/profile')
def profile():
    """Student profile page"""
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
    """Get calendar data for attendance"""
    if not session.get('student_logged_in'):
        return jsonify({'success': False, 'message': 'Not logged in.'}), 401
    
    year = request.args.get('year', type=int, default=datetime.now(IST).year)
    month = request.args.get('month', type=int, default=datetime.now(IST).month)
    
    reg_number = session['registration_number']
    attendance_map = get_month_calendar(reg_number, year, month)
    
    return jsonify({'success': True, 'data': attendance_map})

@app.route('/attendance_page')
def attendance_page():
    """Attendance marking page"""
    if not session.get('student_logged_in'):
        return redirect(url_for('login'))
    return render_template('attendance_form.html')

@app.route('/get_daily_attendance_status')
def get_daily_attendance_status():
    """Get today's attendance status"""
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

@app.route('/get_session_data')
def get_session_data():
    """Get session data"""
    if session.get('student_logged_in'):
        return jsonify({
            'registration_number': session.get('registration_number'),
            'student_name': session.get('student_name')
        })
    return jsonify({'success': False})

# --- ATTENDANCE API ---

@app.route('/mark_attendance', methods=['POST'])
def mark_attendance():
    """Mark student attendance"""
    data = request.get_json()
    registration_number = data.get('registration_number', '').strip()
    year = data.get('year', '').strip()
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    device_fingerprint = data.get('device_fingerprint', '').strip()

    # Check for admin code
    if registration_number.lower() == ADMIN_CODE.lower():
        session['admin_logged_in'] = True
        return jsonify({
            'success': True, 
            'message': 'Admin access granted!',
            'redirect': '/admin',  # ✅ CHANGED: Direct URL instead of url_for()
            'is_admin': True
        }), 200

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

    # Check GPS distance
    distance = haversine(COLLEGE_LAT, COLLEGE_LON, float(latitude), float(longitude))
    if distance > GPS_RADIUS_METERS:
        return jsonify({'success': False, 'message': f'You are not within college campus. Distance: {int(distance)} meters.'}), 400

    now = datetime.now(IST)
    current_time = now.time()
    current_date = now.date()

    # Check time window
    if current_time < time(8, 0):
        return jsonify({'success': False, 'message': 'Attendance window starts at 8:00 AM IST.'}), 400
    if current_time >= time(12, 0):
        return jsonify({'success': False, 'message': 'Attendance window closed at 12:00 PM IST.'}), 400

    interval = get_interval_status(current_time)
    if interval is None:
        return jsonify({'success': False, 'message': 'Invalid attendance interval.'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'success': False, 'message': 'Database connection failed.'}), 500
    try:
        with conn.cursor() as cur:
            # Verify student
            cur.execute("SELECT year FROM registrations WHERE registration_number = %s", (registration_number,))
            student = cur.fetchone()
            if not student:
                return jsonify({'success': False, 'message': 'Invalid Registration Number.'}), 400
            if student['year'] != year:
                return jsonify({'success': False, 'message': f"Student is in {student['year']}, not {year}."}), 400

            # Check if already marked
            cur.execute("""
                SELECT id FROM attendance 
                WHERE registration_number = %s AND date = %s AND interval_number = %s
            """, (registration_number, current_date, interval))
            if cur.fetchone():
                return jsonify({'success': False, 'message': f'Attendance already marked for interval {interval} (hour {interval + 7}).'}), 400

            # Check device duplicate
            cur.execute("""
                SELECT registration_number FROM attendance 
                WHERE device_fingerprint = %s AND date = %s AND interval_number = %s
            """, (device_fingerprint, current_date, interval))
            existing = cur.fetchone()
            if existing and existing['registration_number'] != registration_number:
                return jsonify({'success': False, 'message': f'This device has already been used for interval {interval} today.'}), 400

            # Insert attendance
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

# --- ADMIN ROUTES ---

@app.route('/admin_panel', methods=['GET', 'POST'])
@app.route('/admin', methods=['GET', 'POST'])  # ✅ Both routes handled by same function
def admin_panel():
    """Admin panel"""
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
    """Search students"""
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
    """Admin logout"""
    session.pop('admin_logged_in', None)
    return redirect(url_for('index'))

@app.route('/admin/reset_password', methods=['POST'])
def admin_reset_password():
    """Reset student password"""
    if not session.get('admin_logged_in'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    
    data = request.json
    reg_number = data.get('registration_number')
    new_password = data.get('new_password', '123456').strip()
    
    if not new_password or len(new_password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters'})
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'success': False, 'message': 'Database connection failed'}), 500
    
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE registrations SET password = %s WHERE registration_number = %s", 
                       (new_password, reg_number))
            conn.commit()
        return jsonify({'success': True, 'new_password': new_password})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        conn.close()

@app.route('/admin/delete_student', methods=['POST'])
def admin_delete_student():
    """Delete student and attendance"""
    if not session.get('admin_logged_in'):
        return jsonify({'success': False, 'message': 'Unauthorized'})
    
    data = request.json
    reg_number = data.get('registration_number')
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'success': False, 'message': 'Database connection failed'}), 500
    
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM attendance WHERE registration_number = %s", (reg_number,))
            cur.execute("DELETE FROM registrations WHERE registration_number = %s", (reg_number,))
            conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        conn.close()

@app.route('/admin/reset_attendance', methods=['POST'])
def admin_reset_attendance():
    """Reset attendance records only"""
    if not session.get('admin_logged_in'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    
    data = request.json
    reg_number = data.get('registration_number', '').strip()
    
    if not reg_number:
        return jsonify({'success': False, 'message': 'Registration number is required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'success': False, 'message': 'Database connection failed'}), 500
    
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM registrations WHERE registration_number = %s", (reg_number,))
            student = cur.fetchone()
            
            if not student:
                return jsonify({'success': False, 'message': 'Student not found'}), 400
            
            cur.execute("SELECT COUNT(*) as count FROM attendance WHERE registration_number = %s", (reg_number,))
            count_result = cur.fetchone()
            records_deleted = count_result.get('count', 0) if count_result else 0
            
            cur.execute("DELETE FROM attendance WHERE registration_number = %s", (reg_number,))
            conn.commit()
            
            return jsonify({
                'success': True,
                'message': 'Attendance records reset successfully',
                'student_name': student['name'],
                'records_deleted': records_deleted
            })
            
    except Exception as e:
        print(f"Error resetting attendance: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        conn.close()

@app.route('/admin/reset_all_data', methods=['POST'])
def admin_reset_all_data():
    """Reset all data for student"""
    if not session.get('admin_logged_in'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    
    data = request.json
    reg_number = data.get('registration_number', '').strip()
    confirm = data.get('confirm', False)
    
    if not reg_number:
        return jsonify({'success': False, 'message': 'Registration number is required'}), 400
    
    if not confirm:
        return jsonify({
            'success': False,
            'message': 'Confirmation required',
            'requires_confirmation': True
        }), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'success': False, 'message': 'Database connection failed'}), 500
    
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM registrations WHERE registration_number = %s", (reg_number,))
            student = cur.fetchone()
            
            if not student:
                return jsonify({'success': False, 'message': 'Student not found'}), 400
            
            cur.execute("SELECT COUNT(*) as count FROM attendance WHERE registration_number = %s", (reg_number,))
            attendance_count = cur.fetchone().get('count', 0)
            
            cur.execute("DELETE FROM attendance WHERE registration_number = %s", (reg_number,))
            cur.execute("DELETE FROM registrations WHERE registration_number = %s", (reg_number,))
            
            conn.commit()
            
            return jsonify({
                'success': True,
                'message': 'Student and all records deleted permanently',
                'deleted_student': student['name'],
                'deleted_attendance_records': attendance_count
            })
            
    except Exception as e:
        print(f"Error resetting all data: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        conn.close()

@app.route('/admin/student_interval_records')
def admin_student_interval_records():
    """Get student interval records"""
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

@app.route('/download_full_report')
def download_full_report():
    """Download attendance report as Excel"""
    if not session.get('admin_logged_in'):
        return redirect(url_for('login'))
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'success': False, 'message': 'Database connection failed'}), 500
    
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT registration_number, name, mobile, year, course, registered_at 
                FROM registrations 
                ORDER BY registered_at DESC
            """)
            registrations = cur.fetchall()
            
            cur.execute("""
                SELECT 
                    registration_number,
                    COUNT(*) as total_days,
                    SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_days,
                    SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_days,
                    SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late_days
                FROM attendance
                GROUP BY registration_number
            """)
            attendance_summary = {row['registration_number']: row for row in cur.fetchall()}
        
        # Create Excel workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "Attendance Report"
        
        headers = ['Registration Number', 'Name', 'Mobile', 'Year', 'Course', 'Registered At', 
                   'Total Days', 'Present', 'Absent', 'Late', 'Attendance %']
        ws.append(headers)
        
        for cell in ws[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill(start_color="0070C0", end_color="0070C0", fill_type="solid")
            cell.alignment = Alignment(horizontal="center", vertical="center")
        
        for reg in registrations:
            reg_num = reg['registration_number']
            summary = attendance_summary.get(reg_num, {})
            
            total_days = summary.get('total_days', 0) or 0
            present = summary.get('present_days', 0) or 0
            absent = summary.get('absent_days', 0) or 0
            late = summary.get('late_days', 0) or 0
            
            attendance_pct = (present / total_days * 100) if total_days > 0 else 0
            registered_at = reg['registered_at'].strftime('%Y-%m-%d %H:%M:%S') if reg['registered_at'] else ''
            
            ws.append([
                reg_num,
                reg['name'],
                reg['mobile'],
                reg['year'],
                reg['course'] or 'BCA',
                registered_at,
                total_days,
                present,
                absent,
                late,
                f"{attendance_pct:.2f}%"
            ])
        
        # Set column widths
        ws.column_dimensions['A'].width = 18
        ws.column_dimensions['B'].width = 20
        ws.column_dimensions['C'].width = 12
        ws.column_dimensions['D'].width = 12
        ws.column_dimensions['E'].width = 12
        ws.column_dimensions['F'].width = 20
        ws.column_dimensions['G'].width = 12
        ws.column_dimensions['H'].width = 10
        ws.column_dimensions['I'].width = 10
        ws.column_dimensions['J'].width = 10
        ws.column_dimensions['K'].width = 15
        
        # Create file
        file_stream = BytesIO()
        wb.save(file_stream)
        file_stream.seek(0)
        
        return send_file(
            file_stream,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'attendance_report_{datetime.now(IST).strftime("%Y%m%d_%H%M%S")}.xlsx'
        )
    
    except Exception as e:
        print(f"Error generating report: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        conn.close()

# --- SCHEDULER ---

scheduler = BackgroundScheduler()
scheduler.add_job(
    mark_absent_students,
    'cron',
    hour=22,
    minute=1,
    timezone=IST
)
scheduler.start()

# --- MAIN ---

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
