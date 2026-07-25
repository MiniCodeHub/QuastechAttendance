document.addEventListener("DOMContentLoaded", () => {

    const loginForm = document.getElementById("loginForm");

    if (!loginForm) return;

    loginForm.addEventListener("submit", async function(e){

        e.preventDefault();

        const registration_number = document
            .getElementById("registration_number")
            .value
            .trim();

        const password = document
            .getElementById("password")
            .value
            .trim();

        const message = document.getElementById("loginMessage");

        try{

            const response = await fetch("/login",{

                method:"POST",

                headers:{
                    "Content-Type":"application/json"
                },

                body:JSON.stringify({
                    registration_number,
                    password
                })

            });

            const data = await response.json();

            if(data.redirect){

                window.location.href = data.redirect;
                return;

            }

            if(data.success){

                message.innerHTML =
                `<div style="color:green;">✅ ${data.message}</div>`;

                setTimeout(()=>{
                    window.location.href="/dashboard";
                },700);

            }else{

                message.innerHTML =
                `<div style="color:red;">❌ ${data.message}</div>`;

            }

        }catch(error){

            message.innerHTML =
            `<div style="color:red;">❌ Unable to connect to the server.</div>`;

            console.error(error);

        }

    });

    document.addEventListener('DOMContentLoaded', function() {
        const loginForm = document.querySelector('form');
        const regNumberInput = document.querySelector('input[name="registration_number"]');
        const passwordInput = document.querySelector('input[name="password"]');
        
        if (loginForm) {
            loginForm.addEventListener('submit', function(e) {
                e.preventDefault();
                validateAndSubmitLogin();
            });
        }

        // Real-time validation on input
        if (regNumberInput) {
            regNumberInput.addEventListener('input', function() {
                validateRegNumber();
            });
        }

        if (passwordInput) {
            passwordInput.addEventListener('input', function() {
                validatePassword();
            });
        }
    });


    function validateRegNumber() {
        const regNumberInput = document.querySelector('input[name="registration_number"]');
        const errorDiv = document.getElementById('regNumberError');
        const value = regNumberInput.value.trim();

        if (value === '') {
            if (errorDiv) errorDiv.textContent = '';
            return true;
        }

        // Check if it's the admin credentials
        if (value.toLowerCase() === 'admin') {
            if (errorDiv) {
                errorDiv.textContent = '';
                errorDiv.style.display = 'none';
            }
            return true;
        }

        // For student registration number - must be numeric or alphanumeric
        if (!/^[a-zA-Z0-9]+$/.test(value)) {
            if (errorDiv) {
                errorDiv.textContent = '❌ Registration number should only contain letters and numbers';
                errorDiv.style.display = 'block';
            }
            return false;
        }

        if (value.length < 3) {
            if (errorDiv) {
                errorDiv.textContent = '❌ Registration number must be at least 3 characters';
                errorDiv.style.display = 'block';
            }
            return false;
        }

        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }
        return true;
    }

    function validatePassword() {
        const passwordInput = document.querySelector('input[name="password"]');
        const errorDiv = document.getElementById('passwordError');
        const value = passwordInput.value.trim();

        if (value === '') {
            if (errorDiv) {
                errorDiv.textContent = '';
                errorDiv.style.display = 'none';
            }
            return true;
        }

        if (value.length < 4) {
            if (errorDiv) {
                errorDiv.textContent = '❌ Password must be at least 4 characters';
                errorDiv.style.display = 'block';
            }
            return false;
        }

        if (value.length > 50) {
            if (errorDiv) {
                errorDiv.textContent = '❌ Password is too long (max 50 characters)';
                errorDiv.style.display = 'block';
            }
            return false;
        }

        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }
        return true;
    }

    async function validateAndSubmitLogin() {
        const regNumberInput = document.querySelector('input[name="registration_number"]');
        const passwordInput = document.querySelector('input[name="password"]');
        const regNumber = regNumberInput.value.trim();
        const password = passwordInput.value.trim();

        // Clear previous errors
        clearAllErrors();

        // Check 1: Empty Registration Number
        if (regNumber === '') {
            showError('regNumberError', '❌ Please enter your registration number');
            return;
        }

        // Check 2: Empty Password
        if (password === '') {
            showError('passwordError', '❌ Please enter your password');
            return;
        }

        // Check 3: Invalid Registration Number Format
        if (regNumber.toLowerCase() !== 'admin' && !/^[a-zA-Z0-9]+$/.test(regNumber)) {
            showError('regNumberError', '❌ Registration number should only contain letters and numbers');
            return;
        }

        // Check 4: Registration Number Too Short
        if (regNumber.length < 3) {
            showError('regNumberError', '❌ Registration number is too short');
            return;
        }

        // Check 5: Registration Number Too Long
        if (regNumber.length > 20) {
            showError('regNumberError', '❌ Registration number is too long (max 20 characters)');
            return;
        }

        // Check 6: Password Too Short
        if (password.length < 4) {
            showError('passwordError', '❌ Password is too short');
            return;
        }

        // Check 7: Password Too Long
        if (password.length > 50) {
            showError('passwordError', '❌ Password is too long (max 50 characters)');
            return;
        }

        // Check 8: Invalid Characters in Password
        if (/[<>\"']/g.test(password)) {
            showError('passwordError', '❌ Password contains invalid characters');
            return;
        }

        try {
            // Show loading state
            const submitBtn = document.querySelector('form button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Logging in...';

            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    registration_number: regNumber,
                    password: password
                })
            });

            const data = await response.json();

            if (data.success) {
                // Show success message
                showSuccessMessage('✅ Login successful! Redirecting...');
                setTimeout(() => {
                    if (data.redirect) {
                        window.location.href = data.redirect;
                    } else {
                        window.location.href = data.is_admin ? '/admin' : '/dashboard';
                    }
                }, 1000);
            } else {
                // Handle server validation errors
                const errorMsg = data.message || 'Invalid registration number or password';
                
                // Determine which field caused the error
                if (errorMsg.toLowerCase().includes('registration')) {
                    showError('regNumberError', `❌ ${errorMsg}`);
                } else if (errorMsg.toLowerCase().includes('password')) {
                    showError('passwordError', `❌ ${errorMsg}`);
                } else {
                    showError('loginError', `❌ ${errorMsg}`);
                }

                // Reset submit button
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        } catch (error) {
            console.error('Login error:', error);
            showError('loginError', '❌ Server error. Please try again later.');
            
            // Reset submit button
            const submitBtn = document.querySelector('form button[type="submit"]');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Login';
        }
    }

    function showError(elementId, message) {
        const errorDiv = document.getElementById(elementId);
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            errorDiv.style.color = '#d32f2f';
            errorDiv.style.backgroundColor = '#ffebee';
            errorDiv.style.border = '1px solid #f44336';
            errorDiv.style.padding = '12px';
            errorDiv.style.borderRadius = '4px';
            errorDiv.style.marginBottom = '12px';
            errorDiv.style.fontSize = '14px';
            errorDiv.style.fontWeight = '500';
            
            // Scroll to error
            errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function showSuccessMessage(message) {
        const loginBox = document.querySelector('.login-box');
        if (loginBox) {
            const successDiv = document.createElement('div');
            successDiv.textContent = message;
            successDiv.style.color = '#1b5e20';
            successDiv.style.backgroundColor = '#e8f5e9';
            successDiv.style.border = '1px solid #4caf50';
            successDiv.style.padding = '12px';
            successDiv.style.borderRadius = '4px';
            successDiv.style.marginBottom = '12px';
            successDiv.style.fontSize = '14px';
            successDiv.style.fontWeight = '500';
            successDiv.style.animation = 'slideDown 0.3s ease';
            
            loginBox.insertBefore(successDiv, loginBox.firstChild);
        }
    }

    function clearAllErrors() {
        const errorDivs = document.querySelectorAll('[id$="Error"]');
        errorDivs.forEach(div => {
            div.textContent = '';
            div.style.display = 'none';
        });
    }

    function clearError(elementId) {
        const errorDiv = document.getElementById(elementId);
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }
    }

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function sanitizeInput(input) {
        return input.trim().replace(/[<>\"']/g, '');
    }

});