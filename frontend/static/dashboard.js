document.addEventListener('DOMContentLoaded', function() {
    // --- Initialize Theme from localStorage ---
    function initializeTheme() {
        const savedTheme = localStorage.getItem('app-theme') || 'light';
        const body = document.body;
        
        if (savedTheme === 'dark') {
            body.classList.add('dark-theme');
            body.classList.remove('light-theme');
        } else {
            body.classList.add('light-theme');
            body.classList.remove('dark-theme');
        }
    }

    // --- Theme Toggle Function ---
    window.toggleTheme = function() {
        const body = document.body;
        const isDark = body.classList.contains('dark-theme');
        
        if (isDark) {
            body.classList.remove('dark-theme');
            body.classList.add('light-theme');
            localStorage.setItem('app-theme', 'light');
        } else {
            body.classList.remove('light-theme');
            body.classList.add('dark-theme');
            localStorage.setItem('app-theme', 'dark');
        }
    };

    // Initialize theme on page load
    initializeTheme();

    // --- Calendar Functions ---
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();

    function loadCalendar(year, month) {
        if (year === undefined) year = currentYear;
        if (month === undefined) month = currentMonth;

        document.getElementById('calendarMonth').textContent = 
            new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

        const grid = document.getElementById('calendarGrid');
        grid.innerHTML = '';

        // Fetch attendance data
        fetch(`/calendar_data?year=${year}&month=${month+1}`)
            .then(res => res.json())
            .then(data => {
                if (!data.success) return;
                const attendance = data.data;

                const firstDay = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();

                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                dayNames.forEach(name => {
                    const header = document.createElement('div');
                    header.textContent = name;
                    header.style.fontWeight = 'bold';
                    header.style.textAlign = 'center';
                    header.style.padding = '5px';
                    grid.appendChild(header);
                });

                for (let i = 0; i < firstDay; i++) {
                    const empty = document.createElement('div');
                    empty.style.padding = '10px';
                    grid.appendChild(empty);
                }

                for (let day = 1; day <= daysInMonth; day++) {
                    const cell = document.createElement('div');
                    cell.className = 'calendar-day';
                    cell.textContent = day;

                    const dateObj = new Date(year, month, day);
                    if (dateObj.getDay() === 0) {
                        cell.classList.add('Sunday');
                    } else if (attendance[String(day)]) {
                        const status = attendance[String(day)];
                        if (status === 'Present' || status === 'Late') {
                            cell.classList.add('Present');
                        } else if (status === 'Absent') {
                            cell.classList.add('Absent');
                        }
                    } else {
                        cell.classList.add('other-month');
                    }
                    grid.appendChild(cell);
                }
            })
            .catch(err => console.error('Calendar error:', err));
    }

    // Load calendar on page load
    loadCalendar();

    // Setup calendar navigation
    document.getElementById('prevMonth')?.addEventListener('click', function() {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        loadCalendar(currentYear, currentMonth);
    });

    document.getElementById('nextMonth')?.addEventListener('click', function() {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        loadCalendar(currentYear, currentMonth);
    });

    // --- Interval Records Loading ---
    function loadTodayIntervalRecords() {
        console.log('🔄 Loading interval records...');
        
        fetch('/get_daily_attendance_status')
            .then(res => {
                console.log('📡 Response status:', res.status);
                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .then(data => {
                console.log('📊 Interval data received:', data);
                
                if (!data.success) {
                    document.getElementById('intervalRecords').innerHTML = 
                        `<p style="color: #666; text-align: center; padding: 20px;">No records marked yet today</p>`;
                    return;
                }

                const attendanceStatus = data.attendance_status || {};
                console.log('✅ Attendance Status:', attendanceStatus);
                
                const intervals = [
                    {num: 1, time: '8:00 - 9:00 AM'},
                    {num: 2, time: '9:00 - 10:00 AM'},
                    {num: 3, time: '10:00 - 11:00 AM'},
                    {num: 4, time: '11:00 - 12:00 PM'}
                ];

                let html = '<div class="interval-grid">';
                
                intervals.forEach(interval => {
                    const record = attendanceStatus[interval.num];
                    const status = record ? record.status : 'Not Marked';
                    const time = record ? record.time_in : '--:--:--';
                    const statusClass = status === 'Present' ? 'present' : 
                                       status === 'Absent' ? 'absent' : 'pending';

                    console.log(`Interval ${interval.num}:`, {status, time, statusClass});

                    html += `
                        <div class="interval-card ${statusClass}">
                            <div class="interval-time">${interval.time}</div>
                            <div class="interval-status">${status}</div>
                            <div class="interval-marked">${time}</div>
                        </div>
                    `;
                });
                
                html += '</div>';
                document.getElementById('intervalRecords').innerHTML = html;
                console.log('✨ Interval records loaded successfully');
            })
            .catch(err => {
                console.error('❌ Interval loading error:', err);
                document.getElementById('intervalRecords').innerHTML = 
                    `<p style="color: red; text-align: center; padding: 20px;">Error: ${err.message}</p>`;
            });
    }

    // Load interval records on page load
    loadTodayIntervalRecords();

    // Retry after 1 second if still loading
    setTimeout(() => {
        if (document.getElementById('intervalRecords')?.textContent?.includes('Loading')) {
            console.log('⏱️ Retrying interval load...');
            loadTodayIntervalRecords();
        }
    }, 1000);
});