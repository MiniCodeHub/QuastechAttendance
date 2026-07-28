document.addEventListener('DOMContentLoaded', function() {
    // --- Theme toggle wiring (minimal, idempotent) ---
    (function themeToggleInit(){
        const KEY = 'quastech-theme';
        const body = document.body;
        const toggle = document.getElementById('themeToggle');
        const sun = document.getElementById('sunIcon');
        const moon = document.getElementById('moonIcon');

        function applyTheme(isDark, save=true){
            if (isDark) body.classList.add('dark-theme'); else body.classList.remove('dark-theme');
            if (toggle) toggle.checked = !!isDark;
            if (sun) sun.style.opacity = isDark ? '0.35' : '1';
            if (moon) moon.style.opacity = isDark ? '1' : '0.35';
            try { if (save) localStorage.setItem(KEY, isDark ? 'dark' : 'light'); } catch(e){}
        }

        // restore or use system preference
        try {
            const saved = localStorage.getItem(KEY);
            if (saved) applyTheme(saved === 'dark', false);
            else applyTheme(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches, false);
        } catch(e){
            applyTheme(false, false);
        }

        if (toggle) {
            toggle.addEventListener('change', function(){ applyTheme(this.checked); });
        }
    })();

    // --- Theme Functions ---
    const themeCheckbox = document.getElementById('themeToggle');
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');

    function applyTheme(isDark) {
        const body = document.body;
        if (isDark) body.classList.add('dark-theme'); else body.classList.remove('dark-theme');
        try { localStorage.setItem('app-theme', isDark ? 'dark' : 'light'); } catch(e) {}
        if (themeCheckbox) themeCheckbox.checked = !!isDark;
        if (sunIcon) sunIcon.style.opacity = isDark ? '0.35' : '1';
        if (moonIcon) moonIcon.style.opacity = isDark ? '1' : '0.35';
    }

    function initializeTheme() {
        let saved = null;
        try { saved = localStorage.getItem('app-theme'); } catch(e) {}
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = saved === 'dark' || (saved === null && prefersDark);
        applyTheme(isDark);
    }

    // wire up checkbox change (label clicks will toggle checkbox automatically)
    if (themeCheckbox) {
        themeCheckbox.addEventListener('change', function() {
            applyTheme(this.checked);
        });
    }

    initializeTheme();

    // --- Calendar Variables ---
    const calendarMonthElement = document.getElementById('calendarMonth');
    const calendarGridElement = document.getElementById('calendarGrid');
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // --- Render Interval Cards (4 intervals: 8-9, 9-10, 10-11, 11-12) ---
    function renderIntervalCards(attendanceStatus) {
        const container = document.getElementById('intervalRecords');
        const intervals = [
            {num: 1, time: '8:00 - 9:00 AM'},
            {num: 2, time: '9:00 - 10:00 AM'},
            {num: 3, time: '10:00 - 11:00 AM'},
            {num: 4, time: '11:00 - 12:00 PM'}
        ];

        if (!attendanceStatus || Object.keys(attendanceStatus).length === 0) {
            container.innerHTML = `<p style="color: #666; text-align: center; padding: 20px;">No attendance for this date</p>`;
            return;
        }

        let html = '<div class="interval-grid">';
        intervals.forEach(interval => {
            const record = attendanceStatus[interval.num];
            const status = record ? record.status : 'Not Marked';
            const time = record ? record.time_in : '--:--:--';
            const statusClass = status === 'Present' ? 'present' : 
                               status === 'Absent' ? 'absent' : 'pending';
            html += `
                <div class="interval-card ${statusClass}">
                    <div class="interval-time">${interval.time}</div>
                    <div class="interval-status">${status}</div>
                    <div class="interval-marked">${time}</div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    // --- Update Mini Blocks (4 intervals) ---
    function updateStatsMiniBlocks(attendanceStatus) {
        const intervalLabels = {
            1: '8-9', 2: '9-10', 3: '10-11', 4: '11-12'
        };

        const presentContainer = document.getElementById('presentMiniBlocks');
        const absentContainer = document.getElementById('absentMiniBlocks');

        if (presentContainer) presentContainer.innerHTML = '';
        if (absentContainer) absentContainer.innerHTML = '';

        for (let i = 1; i <= 4; i++) {
            const status = attendanceStatus[i] ? attendanceStatus[i].status : null;
            const label = intervalLabels[i] || i;

            if (presentContainer) {
                const block = document.createElement('span');
                block.className = 'mini-block';
                block.textContent = label;
                block.classList.add(status === 'Present' ? 'present' : 'not-marked');
                presentContainer.appendChild(block);
            }

            if (absentContainer) {
                const block = document.createElement('span');
                block.className = 'mini-block';
                block.textContent = label;
                block.classList.add(status === 'Absent' ? 'absent' : 'not-marked');
                absentContainer.appendChild(block);
            }
        }
    }

    // --- Load attendance for a specific date (today or future) ---
    function loadAttendanceForDate(dateStr) {
        if (dateStr < todayStr) {
            document.getElementById('intervalRecords').innerHTML = 
                `<p style="color: #999; text-align: center; padding: 20px;">Past records are blocked.<br>You can only view attendance from today onwards.</p>`;
            document.getElementById('totalHoursDisplay').textContent = '0';
            document.getElementById('absentCount').textContent = '0';
            document.getElementById('presentHoursDisplay').textContent = '0';
            return;
        }

        // 1. Interval cards
        fetch(`/get_attendance_for_date?date=${dateStr}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    renderIntervalCards(data.attendance_status);
                } else {
                    renderIntervalCards({});
                }
            })
            .catch(err => console.error('Interval error:', err));

        // 2. Stats: present_hours, absent, total_hours
        fetch(`/get_day_summary?date=${dateStr}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('totalHoursDisplay').textContent = data.total_hours;
                    document.getElementById('absentCount').textContent = data.absent;
                    document.getElementById('presentHoursDisplay').textContent = data.present_hours;
                }
            })
            .catch(err => console.error('Day summary error:', err));
    }

    // --- Load Calendar (Mon–Sat only, Sunday removed) ---
    function loadCalendar(year, month) {
        if (year === undefined) year = currentYear;
        if (month === undefined) month = currentMonth;

        calendarMonthElement.textContent = 
            new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

        const grid = calendarGridElement;
        grid.innerHTML = '';

        fetch(`/calendar_data?year=${year}&month=${month+1}`)
            .then(res => res.json())
            .then(data => {
                if (!data.success) return;
                const dayData = data.data;

                const firstDay = new Date(year, month, 1).getDay(); // 0=Sun, 1=Mon...
                const daysInMonth = new Date(year, month + 1, 0).getDate();

                // Day headers: Mon to Sat
                const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                dayNames.forEach(name => {
                    const header = document.createElement('div');
                    header.textContent = name;
                    header.style.fontWeight = 'bold';
                    header.style.textAlign = 'center';
                    header.style.padding = '5px';
                    grid.appendChild(header);
                });

                // Offset: number of empty cells before first Monday
                // If firstDay is Sunday (0), offset = 0 (start with Mon)
                // If firstDay is Monday (1), offset = 0; Tuesday (2) -> 1; ... Saturday (6) -> 5
                let offset = (firstDay === 0) ? 0 : firstDay - 1;
                for (let i = 0; i < offset; i++) {
                    const empty = document.createElement('div');
                    empty.style.padding = '10px';
                    grid.appendChild(empty);
                }

                for (let day = 1; day <= daysInMonth; day++) {
                    const dateObj = new Date(year, month, day);
                    const weekday = dateObj.getDay(); // 0=Sun
                    // Skip Sunday
                    if (weekday === 0) continue;

                    const cell = document.createElement('div');
                    cell.className = 'calendar-day';
                    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                    cell.dataset.date = dateStr;

                    const isPast = dateStr < todayStr;

                    const info = dayData[String(day)];
                    if (info) {
                        cell.classList.add(info.status === 'Present' ? 'Present' : 'Absent');
                        const dayNum = document.createElement('div');
                        dayNum.className = 'day-number';
                        dayNum.textContent = day;
                        cell.appendChild(dayNum);
                    } else {
                        cell.textContent = day;
                        cell.classList.add('no-data');
                    }

                    if (isPast) {
                        cell.classList.add('past-date');
                    } else {
                        cell.addEventListener('click', function(e) {
                            const date = this.dataset.date;
                            if (date) {
                                loadAttendanceForDate(date);
                                document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
                                this.classList.add('selected');
                            }
                        });
                    }

                    grid.appendChild(cell);
                }
            })
            .catch(err => console.error('Calendar error:', err));
    }

    // --- Load Today's Default (Monthly Stats) ---
    function loadTodayDefault() {
        fetch('/get_daily_attendance_status')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    renderIntervalCards(data.attendance_status);
                    updateStatsMiniBlocks(data.attendance_status);
                } else {
                    renderIntervalCards({});
                }
            })
            .catch(err => console.error('Error loading today intervals:', err));
    }

    // --- Initialise ---
    if (calendarMonthElement && calendarGridElement) {
        loadCalendar(currentYear, currentMonth);

        document.getElementById('prevMonth')?.addEventListener('click', function() {
            currentMonth--;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            loadCalendar(currentYear, currentMonth);
        });

        document.getElementById('nextMonth')?.addEventListener('click', function() {
            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            loadCalendar(currentYear, currentMonth);
        });
    }

    loadTodayDefault();

    // Auto-refresh every 30 seconds (only if no date selected)
    setInterval(() => {
        if (!document.querySelector('.calendar-day.selected')) {
            loadTodayDefault();
        }
    }, 30000);
});