import pymysql

try:
    conn = pymysql.connect(
        host="gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
        port=4000,
        user="3dtXqyjkbNdTH2t.root",
        password="vzuHZOlyqLj195LO",
        database="defaultdb",  # Replace with your actual database name
        ssl_verify_cert=True,
        ssl_verify_identity=True,
        ssl_ca="isrgrootx1.pem"  # Path to your downloaded CA certificate
    )

    print("✅ Connected to TiDB successfully!")

    with conn.cursor() as cursor:
        cursor.execute("SELECT VERSION();")
        version = cursor.fetchone()
        print("Database version:", version)

    conn.close()

except Exception as e:
    print("❌ Connection failed!")
    print(e)
