console.log("BioSync OS: Analytics Engine Loaded");

let myChart = null;

window.addEventListener('DOMContentLoaded', async (event) => {
    // 1. TARİHİ BUGÜNE AYARLA
    const dateInput = document.getElementById('record-date');
    if (dateInput) {
        const todayLocal = new Date();
        const yyyy = todayLocal.getFullYear();
        const mm = String(todayLocal.getMonth() + 1).padStart(2, '0');
        const dd = String(todayLocal.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    // 2. GRAFİĞİ ÇİZ
    const chartCanvas = document.getElementById('activityChart');
    if (chartCanvas) {
        const ctx = chartCanvas.getContext('2d');
        myChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Sleep', 'Work', 'Social', 'Labor', 'Free Time'],
                datasets: [{
                    data: [8, 8, 5, 3, 0],
                    backgroundColor: ['#4285f4', '#ea4335', '#fbbc04', '#a142f4', '#e0e0e0'],
                    borderWidth: 2, borderColor: '#ffffff', hoverOffset: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#777777', font: { family: "'Inter', sans-serif", size: 11 } } } }, cutout: '70%' }
        });
    }

    // 3. KLAVYE MANTIK FİLTRESİ
    const timeInputs = document.querySelectorAll('.time-inputs input');
    if (timeInputs.length > 0) {
        timeInputs.forEach(input => {
            input.addEventListener('input', function() {
                let maxLimit = this.id.endsWith('-h') ? 23 : 59;
                if (this.value !== '') {
                    let val = parseInt(this.value);
                    if (val > maxLimit) this.value = maxLimit;
                    if (val < 0) this.value = 0;
                }
            });
        });
    }

    // 4. LEETCODE HEATMAP (Gerçek Takvim Yılı Mantığı)
    const heatmapContainer = document.getElementById('leetcode-heatmap');
    if (heatmapContainer) {
        try {
            const response = await fetch('/api/heatmap');
            const data = await response.json();
            
            heatmapContainer.innerHTML = ''; // Önceki grafiği temizle
            
            // Bulunduğumuz yılı al (Örn: 2026)
            let currentYear = new Date().getFullYear();
            let startDate = new Date(currentYear, 0, 1); // 1 Ocak
            let endDate = new Date(currentYear, 11, 31); // 31 Aralık

            // 1 Ocak hangi güne denk geliyor? (0=Pazar, 1=Pazartesi...)
            let startDayOfWeek = startDate.getDay();
            
            // LeetCode grid'inde görünmez boşluklar yaratarak takvimi hizala
            for(let i=0; i < startDayOfWeek; i++) {
                let emptyBox = document.createElement('div');
                emptyBox.style.width = '14px';
                emptyBox.style.height = '14px';
                emptyBox.style.pointerEvents = 'none'; // Tıklanmasın
                heatmapContainer.appendChild(emptyBox);
            }

            // 1 Ocak'tan 31 Aralık'a kadar tüm günleri çiz
            for(let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                let year = d.getFullYear();
                let month = String(d.getMonth() + 1).padStart(2, '0');
                let day = String(d.getDate()).padStart(2, '0');
                let dateStr = `${year}-${month}-${day}`;

                let box = document.createElement('div');
                box.className = 'heatmap-box';
                
                if(data[dateStr] && data[dateStr] !== "none") {
                    box.classList.add('dom-' + data[dateStr]);
                    box.title = `${dateStr} - Dominant: ${data[dateStr].toUpperCase()}`;
                } else {
                    box.title = `${dateStr} - No data`;
                }
                heatmapContainer.appendChild(box);
            }
        } catch (error) { console.error("Heatmap yüklenemedi:", error); }
    }
});

// 5. PROFİL FOTOĞRAFI YÜKLEME
async function uploadAvatar(input) {
    if (input.files && input.files[0]) {
        let formData = new FormData();
        formData.append("file", input.files[0]);
        try {
            const response = await fetch("/upload_avatar", { method: "POST", body: formData });
            const result = await response.json();
            if (result.success) document.getElementById("sidebar-avatar").src = "/static/uploads/" + result.filename;
            else alert("Upload failed: " + result.error);
        } catch (error) { console.error("Upload error:", error); }
    }
}

// 6. AVATAR VE GRAFİK SENKRONİZASYONU
async function updateState() {
    const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;
    const sMin = getVal("sleep-h") * 60 + getVal("sleep-m");
    const wMin = getVal("work-h") * 60 + getVal("work-m");
    const scMin = getVal("social-h") * 60 + getVal("social-m");
    const lMin = getVal("labor-h") * 60 + getVal("labor-m");

    const totalMin = sMin + wMin + scMin + lMin;
    let freeMin = 1440 - totalMin; 
    
    const statusMsg = document.getElementById("status-message");
    const avatar = document.getElementById("avatar");

    if (totalMin > 1440) {
        statusMsg.style.color = "#d93025"; 
        statusMsg.innerText = "🚨 LIMIT REACHED: Day exceeds 24h!";
        avatar.innerText = "⚠️";
        return;
    }

    if(freeMin < 0) freeMin = 0;

    if (myChart) {
        myChart.data.datasets[0].data = [(sMin/60).toFixed(1), (wMin/60).toFixed(1), (scMin/60).toFixed(1), (lMin/60).toFixed(1), (freeMin/60).toFixed(1)];
        myChart.update();
    }

    statusMsg.style.color = "#0f9d58"; 
    statusMsg.innerText = "Syncing with server...";

    try {
        const response = await fetch("/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mode: document.getElementById("mode-selector").value,
                sleep: sMin / 60, work: wMin / 60, social: scMin / 60, labor: lMin / 60
            })
        });

        const result = await response.json();
        statusMsg.innerText = result.message;

        if (result.state === "tired") { avatar.innerText = "🥱"; statusMsg.style.color = "#d93025"; }
        else if (result.state === "burnout") { avatar.innerText = "🔥"; statusMsg.style.color = "#f29900"; }
        else if (result.state === "distracted") { avatar.innerText = "😵‍💫"; statusMsg.style.color = "#f29900"; }
        else if (result.state === "lonely") { avatar.innerText = "🌧️"; statusMsg.style.color = "#4285f4"; }
        else { avatar.innerText = "👤"; statusMsg.style.color = "#0f9d58"; }

    } catch (error) {
        console.error("Fetch Error:", error);
        statusMsg.innerText = "Connection Error!";
        statusMsg.style.color = "#d93025";
    }
}

// 7. VERİTABANINA KAYDETME
async function saveRecord() {
    const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;
    const sMin = getVal("sleep-h") * 60 + getVal("sleep-m");
    const wMin = getVal("work-h") * 60 + getVal("work-m");
    const scMin = getVal("social-h") * 60 + getVal("social-m");
    const lMin = getVal("labor-h") * 60 + getVal("labor-m");

    const totalMin = sMin + wMin + scMin + lMin;
    const statusMsg = document.getElementById("status-message");

    if (totalMin > 1440) {
        statusMsg.style.color = "#d93025"; 
        statusMsg.innerText = "🚨 Cannot save! Day exceeds 24h.";
        return;
    }

    statusMsg.style.color = "#0f9d58"; 
    statusMsg.innerText = "Saving to database...";

    try {
        const response = await fetch("/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                date: document.getElementById("record-date").value,
                sleep: sMin / 60, work: wMin / 60, social: scMin / 60, labor: lMin / 60
            })
        });

        const result = await response.json();
        if(result.success) {
            statusMsg.style.color = "#4285f4"; 
            statusMsg.innerText = result.message;
        }
    } catch (error) {
        console.error("Save Error:", error);
        statusMsg.style.color = "#d93025";
        statusMsg.innerText = "Error saving record!";
    }
}