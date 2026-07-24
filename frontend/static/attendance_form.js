document.addEventListener('DOMContentLoaded', function () {

    const attendanceForm = document.getElementById('attendanceForm');

    if (attendanceForm) {

        attendanceForm.addEventListener('submit', async (e) => {

            e.preventDefault();

            const regNum = document.getElementById('registration_number').value.trim();
            const yearRadio = document.querySelector('input[name="year"]:checked');

            if (!yearRadio) {
                document.getElementById('attendanceMessage').innerHTML =
                    '<div style="color:red;">Please select year.</div>';
                return;
            }

            if (!navigator.geolocation) {
                document.getElementById('attendanceMessage').innerHTML =
                    '<div style="color:red;">Geolocation not supported.</div>';
                return;
            }

            document.getElementById('attendanceMessage').innerHTML =
                '<div style="color:blue;">Fetching location...</div>';

            navigator.geolocation.getCurrentPosition(async (position) => {

                const fingerprint = await getDeviceFingerprint();

                const payload = {
                    registration_number: regNum,
                    year: yearRadio.value,
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
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

                    if (data.redirect) {

                        window.location.href = data.redirect;

                    } else if (data.success) {

                        document.getElementById('attendanceMessage').innerHTML =
                            `<div style="color:green;">✅ ${data.message}</div>`;

                    } else {

                        document.getElementById('attendanceMessage').innerHTML =
                            `<div style="color:red;">❌ ${data.message}</div>`;

                    }

                } catch {

                    document.getElementById('attendanceMessage').innerHTML =
                        '<div style="color:red;">❌ Error marking attendance.</div>';

                }

            });

        });

    }

});

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

    } catch {

        return 'fallback_' + Math.random().toString(36).substring(2);

    }
}