document.addEventListener('DOMContentLoaded', function () {

    const signupForm = document.getElementById('signupForm');

    if (signupForm) {

        signupForm.addEventListener('submit', async (e) => {

            e.preventDefault();

            const name = document.getElementById('name').value.trim();
            const regNum = document.getElementById('registration_number').value.trim();
            const mobile = document.getElementById('mobile').value.trim();
            const yearRadio = document.querySelector('input[name="year"]:checked');
            const password = document.getElementById('password').value.trim();

            if (!yearRadio) {
                document.getElementById('signupMessage').innerHTML =
                    '<div style="color:red;">Please select year.</div>';
                return;
            }

            const payload = {
                name,
                registration_number: regNum,
                mobile,
                year: yearRadio.value,
                password
            };

            try {

                const res = await fetch('/signup', {
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

                    document.getElementById('signupMessage').innerHTML =
                        `<div style="color:green;">✅ ${data.message}</div>`;

                    setTimeout(() => window.location.href = '/dashboard', 1000);

                } else {

                    document.getElementById('signupMessage').innerHTML =
                        `<div style="color:red;">❌ ${data.message}</div>`;

                }

            } catch (err) {

                document.getElementById('signupMessage').innerHTML =
                    '<div style="color:red;">❌ Error submitting form.</div>';

            }

        });

    }

});