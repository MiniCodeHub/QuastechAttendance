// Signup Form
const signupForm = document.getElementById('signupForm');
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('name')?.value.trim();
        const registration_number = document.getElementById('registration_number')?.value.trim();
        const mobile = document.getElementById('mobile')?.value.trim();
        const year = document.querySelector('input[name="year"]:checked')?.value;
        const password = document.getElementById('password')?.value.trim();

        if (!name || !registration_number || !mobile || !year || !password) {
            showMessage('signupMessage', 'All fields are required', 'error');
            return;
        }

        try {
            const response = await fetch('/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, registration_number, mobile, year, password })
            });
            const data = await response.json();
            if (data.success) {
                showMessage('signupMessage', data.message, 'success');
                setTimeout(() => window.location.href = data.redirect, 1500);
            } else {
                showMessage('signupMessage', data.message, 'error');
            }
        } catch (error) {
            showMessage('signupMessage', 'Error: ' + error.message, 'error');
        }
    });
}

// Login Form
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const registration_number = document.getElementById('registration_number')?.value.trim();
        const password = document.getElementById('password')?.value.trim();

        if (!registration_number || !password) {
            showMessage('loginMessage', 'Registration Number and Password are required', 'error');
            return;
        }

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ registration_number, password })
            });
            const data = await response.json();
            if (data.success) {
                showMessage('loginMessage', data.message, 'success');
                setTimeout(() => window.location.href = data.redirect, 1500);
            } else {
                showMessage('loginMessage', data.message, 'error');
            }
        } catch (error) {
            showMessage('loginMessage', 'Error: ' + error.message, 'error');
        }
    });
}

// Attendance Form
const attendanceForm = document.getElementById('attendanceForm');
if (attendanceForm) {
    // Load registration number from session
    fetch('/get_session_data')
        .then(res => res.json())
        .then(data => {
            if (data.registration_number) {
                document.getElementById('registration_number').value = data.registration_number;
            }
        });

    attendanceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const registration_number = document.getElementById('registration_number')?.value.trim();
        const year = document.querySelector('input[name="year"]:checked')?.value;

        if (!registration_number || !year) {
            showMessage('attendanceMessage', 'Registration Number and Year are required', 'error');
            return;
        }

        // Get GPS location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (position) => {
                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;
                const device_fingerprint = await generateDeviceFingerprint();

                try {
                    const response = await fetch('/mark_attendance', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            registration_number,
                            year,
                            latitude,
                            longitude,
                            device_fingerprint
                        })
                    });
                    const data = await response.json();
                    if (data.success) {
                        showMessage('attendanceMessage', data.message, 'success');
                        setTimeout(() => window.location.href = '/dashboard', 2000);
                    } else {
                        showMessage('attendanceMessage', data.message, 'error');
                    }
                } catch (error) {
                    showMessage('attendanceMessage', 'Error: ' + error.message, 'error');
                }
            }, (error) => {
                showMessage('attendanceMessage', 'Unable to access location. Please enable GPS.', 'error');
            });
        } else {
            showMessage('attendanceMessage', 'Geolocation is not supported by your browser.', 'error');
        }
    });
}

// Helper Functions
function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = type;
        element.style.display = 'block';
    }
}

async function generateDeviceFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Device Fingerprint', 2, 15);
    ctx.fillStyle = 'rgba(102, 126, 234, 0.7)';
    ctx.fillText('Device Fingerprint', 4, 17);
    
    return canvas.toDataURL();
}

// Get Session Data Endpoint
app.route('/get_session_data')(function() {
    if (session.get('student_logged_in')) {
        return jsonify({
            'registration_number': session.get('registration_number'),
            'student_name': session.get('student_name')
        })
    }
    return jsonify({'success': False})
});