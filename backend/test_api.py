import urllib.request, json
from urllib.error import HTTPError

req = urllib.request.Request(
    'https://quastechattendance-1.onrender.com/register',
    data=json.dumps({'name':'Test','registration_number':'123','mobile':'1234567890','year':'FYBCA'}).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

try:
    response = urllib.request.urlopen(req)
    print("Status:", response.status)
    print("Response:", response.read().decode('utf-8'))
except HTTPError as e:
    print("Status:", e.code)
    print("Error Response:", e.read().decode('utf-8'))
except Exception as e:
    print("Other Error:", e)
