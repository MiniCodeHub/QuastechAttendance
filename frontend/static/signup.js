document.addEventListener('DOMContentLoaded', function () {

    const signupForm = document.getElementById('signupForm');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm_password');
    const passwordMatchMsg = document.getElementById('passwordMatch');

    // --- Password Confirmation Validation ---
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', function() {
            if (passwordInput.value !== confirmPasswordInput.value) {
                passwordMatchMsg.style.display = 'block';
                confirmPasswordInput.classList.add('error');
            } else {
                passwordMatchMsg.style.display = 'none';
                confirmPasswordInput.classList.remove('error');
            }
        });

        // Also check on password field change
        passwordInput.addEventListener('input', function() {
            if (confirmPasswordInput.value && passwordInput.value !== confirmPasswordInput.value) {
                passwordMatchMsg.style.display = 'block';
                confirmPasswordInput.classList.add('error');
            } else if (confirmPasswordInput.value && passwordInput.value === confirmPasswordInput.value) {
                passwordMatchMsg.style.display = 'none';
                confirmPasswordInput.classList.remove('error');
            }
        });
    }

    // --- Form Submission ---
    if (signupForm) {

        signupForm.addEventListener('submit', async (e) => {

            e.preventDefault();

            const name = document.getElementById('name').value.trim();
            const regNum = document.getElementById('registration_number').value.trim();
            const mobile = document.getElementById('mobile').value.trim();
            const year = document.getElementById('year').value.trim();
            const course = document.getElementById('course')?.value.trim() || '';
            const password = document.getElementById('password').value.trim();
            const confirmPassword = document.getElementById('confirm_password').value.trim();

            // Validate all required fields
            if (!name || !regNum || !mobile || !year || !password || !confirmPassword) {
                showMessage('❌ All fields are required.', 'error');
                return;
            }

            // Validate passwords match
            if (password !== confirmPassword) {
                showMessage('❌ Passwords do not match.', 'error');
                confirmPasswordInput.classList.add('error');
                passwordMatchMsg.style.display = 'block';
                return;
            }

            // Validate password length
            if (password.length < 6) {
                showMessage('❌ Password must be at least 6 characters.', 'error');
                return;
            }

            // Validate mobile number (10 digits)
            if (!/^\d{10}$/.test(mobile)) {
                showMessage('❌ Mobile number must be 10 digits.', 'error');
                return;
            }

            const payload = {
                name,
                registration_number: regNum,
                mobile,
                year,
                course,
                password,
                confirm_password: confirmPassword
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

                    showMessage(`✅ ${data.message}`, 'success');

                    setTimeout(() => window.location.href = '/login', 2000);

                } else {

                    showMessage(`❌ ${data.message}`, 'error');

                }

            } catch (err) {

                console.error('Signup error:', err);
                showMessage('❌ Error submitting form. Please try again.', 'error');

            }

        });

    }

    // --- Helper Function to Show Messages ---
    function showMessage(message, type) {
        let messageDiv = document.getElementById('signupMessage');
        
        // Create message div if it doesn't exist
        if (!messageDiv) {
            messageDiv = document.createElement('div');
            messageDiv.id = 'signupMessage';
            signupForm.insertBefore(messageDiv, signupForm.firstChild);
        }

        messageDiv.innerHTML = `<div style="color: ${type === 'success' ? '#28a745' : '#dc3545'}; 
                                          background: ${type === 'success' ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)'}; 
                                          padding: 12px; 
                                          border-radius: 6px; 
                                          margin-bottom: 20px; 
                                          border: 1px solid ${type === 'success' ? '#28a745' : '#dc3545'};
                                          font-weight: 600;">${message}</div>`;
    }

});