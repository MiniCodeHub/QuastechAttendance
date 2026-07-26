document.addEventListener('DOMContentLoaded', function () {

    const attendanceForm = document.getElementById('attendanceForm');

    if (attendanceForm) {

        attendanceForm.addEventListener('submit', async (e) => {

            e.preventDefault();

            // Get the submit button and disable it to prevent double submission
            const submitBtn = attendanceForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Marking...';

            const regNum = document.getElementById('registration_number').value.trim();
            const yearRadio = document.querySelector('input[name="year"]:checked');

            if (!yearRadio) {
                document.getElementById('attendanceMessage').innerHTML =
                    '<div style="color:red;">❌ Please select a year.</div>';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Mark Attendance';
                return;
            }

            if (!navigator.geolocation) {
                document.getElementById('attendanceMessage').innerHTML =
                    '<div style="color:red;">❌ Geolocation not supported in this browser.</div>';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Mark Attendance';
                return;
            }

            document.getElementById('attendanceMessage').innerHTML =
                '<div style="color:blue;">📡 Fetching location...</div>';

            navigator.geolocation.getCurrentPosition(async (position) => {

                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const fingerprint = await getDeviceFingerprint();

                const payload = {
                    registration_number: regNum,
                    year: yearRadio.value,
                    latitude: lat,
                    longitude: lng,
                    device_fingerprint: fingerprint
                };

                try {

                    const res = await fetch('/mark_attendance', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    });

                    const data = await res.json();

                    // Check for admin redirect
                    if (data.redirect) {
                        window.location.href = data.redirect;
                        return;
                    }

                    const msgDiv = document.getElementById('attendanceMessage');

                    if (data.success) {
                        msgDiv.innerHTML =
                            `<div style="color:green;">✅ ${data.message}</div>`;
                        // Optionally redirect to dashboard after 2 seconds
                        // setTimeout(() => window.location.href = '/dashboard', 2000);
                    } else {
                        // Show error message (e.g., duplicate, GPS out of range, etc.)
                        msgDiv.innerHTML =
                            `<div style="color:red;">❌ ${data.message}</div>`;
                    }

                    // Re-enable the button after response (success or error)
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Mark Attendance';

                } catch (err) {
                    console.error('Fetch error:', err);
                    document.getElementById('attendanceMessage').innerHTML =
                        '<div style="color:red;">❌ Error connecting to server. Please try again.</div>';
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Mark Attendance';
                }

            }, (error) => {
                // Geolocation error handler
                let msg = "📍 Location access denied. Please enable GPS and allow permission.";
                if (error.code === 1) msg = "❌ Permission denied. Please allow location in browser settings.";
                else if (error.code === 2) msg = "❌ Location unavailable. Please try again.";
                else if (error.code === 3) msg = "❌ Location request timed out. Please try again.";
                document.getElementById('attendanceMessage').innerHTML =
                    `<div style="color:red;">${msg}</div>`;
                submitBtn.disabled = false;
                submitBtn.textContent = 'Mark Attendance';
            }, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });

        });
    }

});

/**
 * Generate a unique device fingerprint using canvas fingerprinting,
 * user agent, screen resolution, and timezone.
 */
async function getDeviceFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');

        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('QUASTECH', 2, 15);
        ctx.fillStyle = 'rgba(102,204,0,.7)';
        ctx.fillText('Attendance', 4, 17);

        const fingerprintString =
            canvas.toDataURL() +
            navigator.userAgent +
            `${screen.width}x${screen.height}` +
            Intl.DateTimeFormat().resolvedOptions().timeZone;

        const hashBuffer = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(fingerprintString)
        );

        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

    } catch (error) {
        console.warn('Fingerprint generation failed, using fallback:', error);
        return 'fallback_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
    }
}