let dailyProblemsChart;
let monthlyProblemsChart;

function initCharts() {
    initDailyChart();
    initMonthlyChart();
}

function generateDatasetColors(count) {
    const baseColors = [
        { bg: 'rgba(54, 162, 235, 0.5)', border: 'rgba(54, 162, 235, 1)' },
        { bg: 'rgba(255, 99, 132, 0.5)', border: 'rgba(255, 99, 132, 1)' },
        { bg: 'rgba(75, 192, 192, 0.5)', border: 'rgba(75, 192, 192, 1)' },
        { bg: 'rgba(255, 206, 86, 0.5)', border: 'rgba(255, 206, 86, 1)' },
        { bg: 'rgba(153, 102, 255, 0.5)', border: 'rgba(153, 102, 255, 1)' }
    ];
    
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(baseColors[i % baseColors.length]);
    }
    return colors;
}

function getPieColors(count) {
    // Paleta de 12 cores distintas (uma para cada mês)
    const palette = [
        'rgba(75, 192, 192, 0.8)',
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 206, 86, 0.8)',
        'rgba(153, 102, 255, 0.8)',
        'rgba(255, 159, 64, 0.8)',
        'rgba(255, 99, 132, 0.8)',
        'rgba(0, 200, 83, 0.8)',
        'rgba(255, 87, 34, 0.8)',
        'rgba(0, 188, 212, 0.8)',
        'rgba(233, 30, 99, 0.8)',
        'rgba(205, 220, 57, 0.8)',
        'rgba(121, 85, 72, 0.8)'
    ];
    // Repete as cores se count > 12
    return Array.from({length: count}, (_, i) => palette[i % palette.length]);
}

function initDailyChart() {
    const ctx = document.getElementById('dailyProblemsChart').getContext('2d');
    dailyProblemsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Atendimentos Concluídos',
                data: [],
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
                borderRadius: 5,
                maxBarThickness: 50
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        precision: 0,
                        color: '#E4E6EF'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: '#E4E6EF'
                    },
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            return value === 1 ? '1 problema' : `${value} problemas`;
                        }
                    }
                }
            }
        }
    });
}

function initMonthlyChart() {
    const ctx = document.getElementById('monthlyProblemsChart').getContext('2d');
    monthlyProblemsChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: []
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#E4E6EF'
                    }
                }
            }
        }
    });
}

async function updateChartData(weeklyData, monthlyData) {
    if (weeklyData) {
        const staticDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
        
        const data = weeklyData.data.map(d => d.completed);

        dailyProblemsChart.data.labels = staticDays;
        dailyProblemsChart.data.datasets[0].data = data;
        dailyProblemsChart.update('none');
    }

    if (monthlyData) {
        const nonZeroMonths = monthlyData.data
            .map((d, i) => ({
                label: monthlyData.labels[i],
                value: d.completed
            }))
            .filter(d => d.value > 0);

        monthlyProblemsChart.data.labels = nonZeroMonths.map(d => d.label);
        monthlyProblemsChart.data.datasets[0].data = nonZeroMonths.map(d => d.value);
        monthlyProblemsChart.data.datasets[0].backgroundColor = getPieColors(nonZeroMonths.length);
        monthlyProblemsChart.update('none');
    }
}

function updateChartsTheme(isDark) {
    const chartColor = isDark ? 
        { bg: 'rgba(75, 192, 192, 0.6)', border: 'rgba(75, 192, 192, 1)' } : 
        { bg: 'rgba(54, 162, 235, 0.5)', border: 'rgba(54, 162, 235, 1)' };
    
    const textColor = isDark ? '#E4E6EF' : '#666';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    dailyProblemsChart.data.datasets[0].backgroundColor = chartColor.bg;
    dailyProblemsChart.data.datasets[0].borderColor = chartColor.border;
    dailyProblemsChart.options.scales.y.ticks.color = textColor;
    dailyProblemsChart.options.scales.x.ticks.color = textColor;
    dailyProblemsChart.options.scales.y.grid.color = gridColor;
    
    monthlyProblemsChart.options.plugins.legend.labels.color = textColor;
    
    dailyProblemsChart.update();
    monthlyProblemsChart.update();
}

window.Charts = {
    init: initCharts,
    updateData: updateChartData,
    updateTheme: updateChartsTheme
};
