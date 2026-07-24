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

});