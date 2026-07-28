-- Table: registrations
-- Table: attendance

CREATE TABLE registrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    registration_number VARCHAR(20) NOT NULL,
    FOREIGN KEY (registration_number) REFERENCES attendance(registration_number) ON DELETE CASCADE
);

CREATE TABLE attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    registration_number VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    time_in TIME NOT NULL,
    status ENUM('Present','Late','Absent','Timeout') NOT NULL,
    device_fingerprint VARCHAR(64) DEFAULT NULL,
    FOREIGN KEY (registration_number) REFERENCES registrations(registration_number) ON DELETE CASCADE,
    UNIQUE KEY unique_attendance (registration_number, date)
);
