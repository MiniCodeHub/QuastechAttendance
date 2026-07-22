from utils import get_db_connection
from datetime import date

class Registration:
    @staticmethod
    def create(registration_number, name, mobile, year):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO registrations (registration_number, name, mobile, year) VALUES (%s, %s, %s, %s)",
            (registration_number, name, mobile, year)
        )
        conn.commit()
        cursor.close()
        conn.close()
    
    @staticmethod
    def find_by_mobile(mobile):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM registrations WHERE mobile = %s", (mobile,))
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        return result
    
    @staticmethod
    def find_by_registration_number(reg_number):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM registrations WHERE registration_number = %s", (reg_number,))
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        return result

class Attendance:
    @staticmethod
    def mark_attendance(registration_number, time_in, status):
        conn = get_db_connection()
        cursor = conn.cursor()
        today = date.today()
        cursor.execute("SELECT id FROM attendance WHERE registration_number = %s AND date = %s", (registration_number, today))
        if cursor.fetchone():
            cursor.close()
            conn.close()
            return False
        cursor.execute(
            "INSERT INTO attendance (registration_number, date, time_in, status) VALUES (%s, %s, %s, %s)",
            (registration_number, today, time_in, status)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return True