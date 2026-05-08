document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csvFile');
    const uploadArea = document.getElementById('uploadArea');
    const fileNameDisplay = document.getElementById('fileName');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const statusMessage = document.getElementById('statusMessage');
    const dashboard = document.getElementById('dashboard');

    let selectedFile = null;
    let globalClustersData = [];
    let currentPage = 1;
    const rowsPerPage = 10;
    const API_URL = "https://data-segmentation.onrender.com/analyze";
    
    // Chart instances
    let barChartInstance = null;
    let scatterPlotInstance = null;

    // Drag and drop events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('dragover'), false);
    });

    uploadArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    });

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            
            // Validate file type
            if (!file.name.endsWith('.csv')) {
                showError("Invalid file type. Please upload a CSV file.");
                return;
            }
            
            // Validate file size (10MB max)
            if (file.size > 10 * 1024 * 1024) {
                showError("File is too large. Maximum size is 10MB.");
                return;
            }

            selectedFile = file;
            fileNameDisplay.textContent = file.name;
            analyzeBtn.disabled = false;
            statusMessage.textContent = "";
            statusMessage.className = "status-message";
        }
    }

    analyzeBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        // UI Loading state
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = "Processing...";
        statusMessage.textContent = "";
        dashboard.classList.add('hidden');

        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "An error occurred during analysis.");
            }

            // Success
            showSuccess("Analysis complete!");
            renderDashboard(data);

        } catch (error) {
            showError(error.message);
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = "Analyze Data";
        }
    });

    function showError(msg) {
        statusMessage.textContent = msg;
        statusMessage.className = "status-message error";
        selectedFile = null;
        fileInput.value = "";
        fileNameDisplay.textContent = "Click to select a CSV file";
        analyzeBtn.disabled = true;
    }

    function showSuccess(msg) {
        statusMessage.textContent = msg;
        statusMessage.className = "status-message success";
    }

    function renderDashboard(data) {
        dashboard.classList.remove('hidden');
        
        // 1. Update summary cards
        document.getElementById('highValueCount').textContent = data.summary['High Value'] || 0;
        document.getElementById('mediumValueCount').textContent = data.summary['Medium Value'] || 0;
        document.getElementById('lowValueCount').textContent = data.summary['Low Value'] || 0;

        // 2. Render Charts
        renderBarChart(data.chart_data);
        renderScatterPlot(data.clusters);

        // 3. Render Table
        globalClustersData = data.clusters;
        currentPage = 1;
        renderTable();
    }

    function renderBarChart(chartData) {
        const ctx = document.getElementById('barChart').getContext('2d');
        
        if (barChartInstance) {
            barChartInstance.destroy();
        }

        barChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Number of Customers',
                    data: chartData.values,
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.8)', // High - Green
                        'rgba(245, 158, 11, 0.8)', // Medium - Yellow
                        'rgba(239, 68, 68, 0.8)'   // Low - Red
                    ],
                    borderWidth: 0,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }

    function renderScatterPlot(clustersData) {
        const ctx = document.getElementById('scatterPlot').getContext('2d');
        
        if (scatterPlotInstance) {
            scatterPlotInstance.destroy();
        }

        // Prepare data series for each segment
        const datasets = [];
        const colors = {
            'High Value': 'rgba(16, 185, 129, 0.6)',
            'Medium Value': 'rgba(245, 158, 11, 0.6)',
            'Low Value': 'rgba(239, 68, 68, 0.6)'
        };

        ['High Value', 'Medium Value', 'Low Value'].forEach(segment => {
            const points = clustersData
                .filter(c => c.Segment === segment)
                .map(c => ({
                    x: c.Recency, // typically want recency on x
                    y: c.Monetary // monetary on y
                }));

            if (points.length > 0) {
                datasets.push({
                    label: segment,
                    data: points,
                    backgroundColor: colors[segment],
                    pointRadius: 5,
                    pointHoverRadius: 7
                });
            }
        });

        scatterPlotInstance = new Chart(ctx, {
            type: 'scatter',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: { display: true, text: 'Recency (Days)' }
                    },
                    y: {
                        title: { display: true, text: 'Monetary Value ($)' },
                        beginAtZero: true
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Recency: ${context.parsed.x}, Monetary: $${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Table Pagination Logic
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });

    nextBtn.addEventListener('click', () => {
        const maxPage = Math.ceil(globalClustersData.length / rowsPerPage);
        if (currentPage < maxPage) {
            currentPage++;
            renderTable();
        }
    });

    function renderTable() {
        const tbody = document.querySelector('#customerTable tbody');
        tbody.innerHTML = '';

        const start = (currentPage - 1) * rowsPerPage;
        const end = start + rowsPerPage;
        const pageData = globalClustersData.slice(start, end);

        pageData.forEach(row => {
            const tr = document.createElement('tr');
            
            let badgeClass = '';
            if (row.Segment === 'High Value') badgeClass = 'segment-high';
            else if (row.Segment === 'Medium Value') badgeClass = 'segment-medium';
            else badgeClass = 'segment-low';

            tr.innerHTML = `
                <td>${row.CustomerID}</td>
                <td>${row.Recency}</td>
                <td>${row.Frequency}</td>
                <td>$${row.Monetary.toFixed(2)}</td>
                <td><span class="segment-badge ${badgeClass}">${row.Segment}</span></td>
            `;
            tbody.appendChild(tr);
        });

        // Update pagination UI
        const maxPage = Math.ceil(globalClustersData.length / rowsPerPage) || 1;
        document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${maxPage}`;
        
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === maxPage;
    }
});
