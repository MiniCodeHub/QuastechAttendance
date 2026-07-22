import re
import pytz
from datetime import datetime, date, timedelta
import pymysql
from pymysql.cursors import DictCursor
from openpyxl import Workbook
from openpyxl.chart import PieChart, Reference, BarChart
from openpyxl.styles import Font, Alignment
from openpyxl.utils import get_column_letter
import os
from backend.config import Config

def get_db_connection():
    return pymysql.connect(
        host=Config.MYSQL_HOST,
        user=Config.MYSQL_USER,
        password=Config.MYSQL_PASSWORD,
        database=Config.MYSQL_DB,
        charset='utf8mb4',
        cursorclass=DictCursor
    )

def mark_absent_for_day(target_date):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT registration_number FROM registrations")
    students = cursor.fetchall()
    for row in students:
        reg_num = row['registration_number']
        cursor.execute("SELECT id FROM attendance WHERE registration_number = %s AND date = %s", (reg_num, target_date))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO attendance (registration_number, date, time_in, status) VALUES (%s, %s, %s, %s)",
                (reg_num, target_date, datetime.min.time(), 'Absent')
            )
    conn.commit()
    cursor.close()
    conn.close()