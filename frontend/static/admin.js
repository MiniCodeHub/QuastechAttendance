let resetRegNumber = "";

function openResetModal(regNumber, studentName) {
    resetRegNumber = regNumber;

    document.getElementById("studentInfo").textContent =
        `Student: ${studentName} (${regNumber})`;

    document.getElementById("newPassword").value = "";

    document.getElementById("resetModal").style.display = "flex";
}

function closeResetModal() {
    document.getElementById("resetModal").style.display = "none";
}

async function confirmResetPassword() {

    const newPassword = document
        .getElementById("newPassword")
        .value
        .trim();

    if (!newPassword) {
        alert("Please enter a new password.");
        return;
    }

    if (newPassword.length < 6) {
        alert("Password must be at least 6 characters long.");
        return;
    }

    try {

        const response = await fetch("/admin/reset_password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                registration_number: resetRegNumber,
                new_password: newPassword
            })
        });

        const data = await response.json();

        if (data.success) {

            alert("Password reset successfully.");

            closeResetModal();

            location.reload();

        } else {

            alert(data.message || "Unable to reset password.");

        }

    } catch (error) {

        console.error(error);
        alert("Server error while resetting password.");

    }

}

async function deleteRecord(regNumber) {

    const confirmDelete = confirm(
        `Delete student ${regNumber}?\n\nThis action cannot be undone.`
    );

    if (!confirmDelete) return;

    try {

        const response = await fetch("/admin/delete_student", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                registration_number: regNumber
            })
        });

        const data = await response.json();

        if (data.success) {

            alert("Student deleted successfully.");

            location.reload();

        } else {

            alert(data.message || "Unable to delete student.");

        }

    } catch (error) {

        console.error(error);
        alert("Server error while deleting student.");

    }

}

async function searchStudents() {

    const query = document
        .getElementById("searchInput")
        .value
        .trim();

    if (!query) {

        location.reload();
        return;

    }

    try {

        const response = await fetch(
            `/admin/search?q=${encodeURIComponent(query)}`
        );

        const data = await response.json();

        if (!data.success || !data.data) return;

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Registration Number</th>
                        <th>Name</th>
                        <th>Mobile</th>
                        <th>Year</th>
                        <th>Course</th>
                        <th>Password</th>
                        <th>Registered At</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.data.forEach(student => {

            html += `
                <tr>
                    <td>${student.registration_number}</td>
                    <td>${student.name}</td>
                    <td>${student.mobile}</td>
                    <td>${student.year}</td>
                    <td>${student.course || "BCA"}</td>
                    <td>${student.password}</td>
                    <td>${
                        student.registered_at
                            ? new Date(student.registered_at).toLocaleString()
                            : ""
                    }</td>
                    <td>
                        <button
                            class="btn btn-reset"
                            onclick="openResetModal('${student.registration_number}','${student.name}')">
                            🔑 Reset
                        </button>

                        <button
                            class="btn btn-delete"
                            onclick="deleteRecord('${student.registration_number}')">
                            🗑️ Delete
                        </button>
                    </td>
                </tr>
            `;

        });

        html += `
                </tbody>
            </table>
        `;

        document.getElementById("registrationsTable").innerHTML = html;

    } catch (error) {

        console.error(error);
        alert("Unable to search students.");

    }

}

window.addEventListener("click", function (event) {

    const modal = document.getElementById("resetModal");

    if (event.target === modal) {

        closeResetModal();

    }

});


window.addEventListener("keydown", function (event) {

    if (event.key === "Escape") {

        closeResetModal();

    }

});