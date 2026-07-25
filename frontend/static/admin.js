let currentRegNumber = '';
let deleteOption = '';
let currentDeleteType = '';
let resetRegNumber = "";
let selectedResetType = "";

// =====================
// TOGGLE VIEWS
// =====================

document.addEventListener('DOMContentLoaded', function() {
    // Toggle Views
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const view = this.getAttribute('data-view');
            document.querySelectorAll('.view-section').forEach(section => {
                section.style.display = 'none';
            });
            document.getElementById(view + '-view').style.display = 'block';
            
            if (view === 'attendance') {
                loadAttendanceData();
            }
        });
    });

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keyup', function() {
            const searchTerm = this.value.toLowerCase();
            const tableBody = document.getElementById('tableBody');
            if (tableBody) {
                document.querySelectorAll('#tableBody tr').forEach(row => {
                    const regNo = row.getAttribute('data-reg-number');
                    if (!regNo) return;
                    const regNoLower = regNo.toLowerCase();
                    const name = row.cells[1] ? row.cells[1].textContent.toLowerCase() : '';
                    row.style.display = (regNoLower.includes(searchTerm) || name.includes(searchTerm)) ? '' : 'none';
                });
            }
        });
    }
});

// =====================
// VIEW INTERVALS
// =====================

function viewIntervals(regNumber) {
    currentRegNumber = regNumber;
    
    fetch(`/admin/student_interval_records?reg_number=${regNumber}`)
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                const recordsDiv = document.getElementById('intervalRecords');
                if (recordsDiv) {
                    recordsDiv.innerHTML = '<p style="text-align: center; color: #999;">No attendance marked today</p>';
                }
                return;
            }

            const recordsDiv = document.getElementById('intervalRecords');
            if (!recordsDiv) return;
            
            recordsDiv.innerHTML = '';

            const intervals = [
                {num: 1, time: '8:00 - 9:00 AM'},
                {num: 2, time: '9:00 - 10:00 AM'},
                {num: 3, time: '10:00 - 11:00 AM'},
                {num: 4, time: '11:00 - 12:00 PM'}
            ];

            const records = data.records || {};
            
            if (Object.keys(records).length === 0) {
                recordsDiv.innerHTML = '<p style="text-align: center; color: #999;">No attendance marked today</p>';
            } else {
                intervals.forEach(interval => {
                    const record = records[interval.num];
                    const status = record ? record.status : 'Not Marked';
                    const time = record ? record.time_in : '--:--:--';
                    const statusClass = status === 'Present' ? 'present' : status === 'Absent' ? 'absent' : 'pending';

                    recordsDiv.innerHTML += `
                        <div class="interval-card-admin ${statusClass}">
                            <div class="interval-time">${interval.time}</div>
                            <div class="interval-status">${status}</div>
                            <div class="interval-marked">${time}</div>
                        </div>
                    `;
                });
            }

            const studentRow = document.querySelector(`tr[data-reg-number="${regNumber}"]`);
            const studentName = studentRow ? studentRow.cells[1].textContent : 'Unknown';
            const studentNameDisplay = document.getElementById('studentNameDisplay');
            if (studentNameDisplay) {
                studentNameDisplay.textContent = `📝 ${studentName} (${regNumber})`;
            }

            const modal = document.getElementById('intervalModal');
            if (modal) {
                modal.classList.add('show');
            }
        })
        .catch(err => {
            console.error('Error:', err);
            alert('❌ Failed to load interval records');
        });
}

// =====================
// RESET PASSWORD
// =====================

function resetPassword(regNumber, name) {
    currentRegNumber = regNumber;
    resetRegNumber = regNumber;
    
    const studentNameInput = document.getElementById('studentName');
    const newPasswordInput = document.getElementById('newPassword');
    
    if (studentNameInput) studentNameInput.value = name;
    if (newPasswordInput) newPasswordInput.value = '123456';
    
    const modal = document.getElementById('resetPasswordModal');
    if (modal) {
        modal.classList.add('show');
    }
}

async function confirmResetPassword() {
    const newPassword = document.getElementById('newPassword').value.trim();

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
                registration_number: currentRegNumber,
                new_password: newPassword
            })
        });

        const data = await response.json();

        if (data.success) {
            alert("✅ Password reset successfully.\nNew password: " + data.new_password);
            closeModal('resetPasswordModal');
            location.reload();
        } else {
            alert("❌ " + (data.message || "Unable to reset password."));
        }
    } catch (error) {
        console.error(error);
        alert("❌ Server error while resetting password.");
    }
}

// =====================
// DELETE STUDENT
// =====================

function deleteStudent(regNumber, name) {
    currentRegNumber = regNumber;
    currentDeleteType = '';
    
    const deleteStudentInfo = document.getElementById('deleteStudentInfo');
    if (deleteStudentInfo) {
        deleteStudentInfo.innerHTML = `<strong>${name}</strong> (${regNumber})`;
    }
    
    const confirmDeleteMessage = document.getElementById('confirmDeleteMessage');
    if (confirmDeleteMessage) {
        confirmDeleteMessage.style.display = 'none';
    }
    
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.disabled = true;
    }
    
    document.querySelectorAll('.reset-option').forEach(opt => opt.classList.remove('selected'));
    
    const modal = document.getElementById('deleteModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function selectDeleteOption(element, type) {
    document.querySelectorAll('.reset-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    currentDeleteType = type;
    
    const confirmDeleteMessage = document.getElementById('confirmDeleteMessage');
    if (confirmDeleteMessage) {
        confirmDeleteMessage.style.display = 'block';
    }
    
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.disabled = false;
    }
}

async function confirmDelete() {
    if (!currentDeleteType) {
        alert('Please select an option');
        return;
    }

    let endpoint, body;

    if (currentDeleteType === 'attendance') {
        endpoint = '/admin/reset_attendance';
        body = { registration_number: currentRegNumber };
    } else if (currentDeleteType === 'all') {
        endpoint = '/admin/reset_all_data';
        body = { registration_number: currentRegNumber, confirm: true };
    }

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.success) {
            let successMsg = '';
            if (currentDeleteType === 'attendance') {
                successMsg = `✅ Attendance reset!\n${data.records_deleted || 0} records deleted`;
            } else if (currentDeleteType === 'all') {
                successMsg = `✅ Student and records deleted!\nName: ${data.deleted_student}\nRecords deleted: ${data.deleted_attendance_records}`;
            }
            alert(successMsg);
            closeModal('deleteModal');
            location.reload();
        } else {
            alert('❌ ' + (data.message || 'Failed to delete'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Server error while processing delete');
    }
}

// =====================
// ATTENDANCE YEAR-WISE
// =====================

async function loadAttendanceData() {
    try {
        const response = await fetch('/api/get_all_attendance');
        const data = await response.json();

        if (data.success) {
            updateAttendanceTable(data.attendance);
        }
    } catch (error) {
        console.error('Error loading attendance:', error);
    }
}

function updateAttendanceTable(attendanceData) {
    // Process and display attendance data based on your backend response
    const attendanceBody = document.getElementById('attendanceBody');
    if (!attendanceBody) return;

    // This function updates the attendance table with data from the backend
    // Implementation depends on your specific database structure
    console.log('Attendance data loaded:', attendanceData);
}

function filterAttendance() {
    const year = document.getElementById('yearFilter').value;
    const course = document.getElementById('courseFilter').value;
    const session = document.getElementById('sessionFilter').value;

    const attendanceRows = document.querySelectorAll('.attendance-row');
    attendanceRows.forEach(row => {
        const rowYear = row.getAttribute('data-year');
        const rowCourse = row.getAttribute('data-course');

        const yearMatch = !year || rowYear === year;
        const courseMatch = !course || rowCourse === course;

        row.style.display = (yearMatch && courseMatch) ? '' : 'none';
    });
}

// =====================
// MODAL FUNCTIONS
// =====================

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
    }
}

// Close modals on Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        document.querySelectorAll('.modal.show').forEach(modal => {
            modal.classList.remove('show');
        });
    }
});

// =====================
// LEGACY FUNCTIONS (Backward compatibility)
// =====================

function openResetModal(regNumber, studentName) {
    resetPassword(regNumber, studentName);
}

function closeResetModal() {
    closeModal('resetPasswordModal');
}

function openDataResetModal(regNumber, studentName) {
    deleteStudent(regNumber, studentName);
}

function closeDataResetModal() {
    closeModal('deleteModal');
}

function selectResetType(type) {
    selectedResetType = type;
    
    document.querySelectorAll('.reset-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    if (event.target.closest('.reset-option')) {
        event.target.closest('.reset-option').classList.add('selected');
    }
    
    let message = '';
    switch(type) {
        case 'attendance_only':
            message = '🔄 Reset Attendance Only - Delete all attendance records, keep student registration';
            break;
        case 'password_only':
            message = '🔑 Reset Password - Reset to default password (123456)';
            break;
        case 'all_data':
            message = '⚠️ Reset All Data - Permanently delete student and all attendance records';
            break;
    }
    
    const confirmMsg = document.getElementById('resetConfirmMessage');
    if (confirmMsg) {
        confirmMsg.textContent = message;
    }
    
    const confirmBtn = document.getElementById('confirmResetBtn');
    if (confirmBtn) {
        confirmBtn.style.display = 'block';
    }
}

async function confirmDataReset() {
    if (!selectedResetType) {
        alert("Please select a reset option.");
        return;
    }

    let confirmMsg = '';
    switch(selectedResetType) {
        case 'attendance_only':
            confirmMsg = '🔄 Reset all attendance records?\nThe student registration will remain.';
            break;
        case 'password_only':
            confirmMsg = '🔑 Reset password to default (123456)?';
            break;
        case 'all_data':
            confirmMsg = '⚠️ PERMANENT DELETE: This will delete the student and all records.\nThis cannot be undone!';
            break;
    }

    if (!confirm(confirmMsg)) return;

    if (selectedResetType === 'all_data') {
        if (!confirm('Are you absolutely sure? This cannot be undone.')) return;
    }

    try {
        let endpoint = '';
        let payload = { registration_number: currentRegNumber || resetRegNumber };

        if (selectedResetType === 'attendance_only') {
            endpoint = '/admin/reset_attendance';
        } else if (selectedResetType === 'password_only') {
            endpoint = '/admin/reset_password';
            payload.new_password = '123456';
        } else if (selectedResetType === 'all_data') {
            endpoint = '/admin/reset_all_data';
            payload.confirm = true;
        }

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            let successMsg = '';
            switch(selectedResetType) {
                case 'attendance_only':
                    successMsg = `✅ Attendance reset!\n${data.records_deleted} records deleted`;
                    break;
                case 'password_only':
                    successMsg = `✅ Password reset to: 123456`;
                    break;
                case 'all_data':
                    successMsg = `✅ Student deleted!\nName: ${data.deleted_student}\nRecords deleted: ${data.deleted_attendance_records}`;
                    break;
            }
            alert(successMsg);
            closeDataResetModal();
            location.reload();
        } else {
            alert("❌ " + (data.message || "Unable to reset data."));
        }
    } catch (error) {
        console.error(error);
        alert("❌ Server error while resetting data.");
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
            alert("✅ Student deleted successfully.");
            location.reload();
        } else {
            alert("❌ " + (data.message || "Unable to delete student."));
        }
    } catch (error) {
        console.error(error);
        alert("❌ Server error while deleting student.");
    }
}

async function searchStudents() {
    const query = document.getElementById("searchInput").value.trim();

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
            <table class="responsive-table">
                <thead>
                    <tr>
                        <th>Registration Number</th>
                        <th>Name</th>
                        <th>Mobile</th>
                        <th>Year</th>
                        <th>Course</th>
                        <th>Registered At</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.data.forEach(student => {
            html += `
                <tr>
                    <td data-label="Reg No">${student.registration_number}</td>
                    <td data-label="Name">${student.name}</td>
                    <td data-label="Mobile">${student.mobile}</td>
                    <td data-label="Year">${student.year}</td>
                    <td data-label="Course">${student.course || "BCA"}</td>
                    <td data-label="Registered">${
                        student.registered_at
                            ? new Date(student.registered_at).toLocaleString()
                            : ""
                    }</td>
                    <td data-label="Actions">
                        <div class="action-buttons">
                            <button class="btn btn-reset" onclick="resetPassword('${student.registration_number}','${student.name}')">
                                🔑 Reset
                            </button>
                            <button class="btn btn-delete" onclick="deleteStudent('${student.registration_number}','${student.name}')">
                                🗑️ Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        const registrationsTable = document.getElementById("registrationsTable");
        if (registrationsTable) {
            registrationsTable.innerHTML = html;
        }

    } catch (error) {
        console.error(error);
        alert("❌ Unable to search students.");
    }
}

function viewIntervalRecords(regNumber, studentName) {
    viewIntervals(regNumber);
}

function closeIntervalModal() {
    closeModal('intervalModal');
}