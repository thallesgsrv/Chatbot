let dailyProblemsChart;
let monthlyProblemsChart;
let feedbackChart;

function initCharts() {
    initDailyChart();
    initMonthlyChart();
    initFeedbackChart();
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
                        color: document.body.classList.contains('dark-theme') ? '#FFFFFF' : '#000000'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: document.body.classList.contains('dark-theme') ? '#FFFFFF' : '#000000'
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
                            return `Atendimentos concluídos: ${value}`;
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
                        color: document.body.classList.contains('dark-theme') ? '#FFFFFF' : '#000000',
                        padding: 10
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Atendimentos concluídos ${context.label}: ${context.parsed}`;
                        }
                    }
                }
            }
        }
    });
}

function initFeedbackChart() {
    const ctx = document.getElementById('feedbackChart').getContext('2d');
    feedbackChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    'rgba(75, 192, 192, 0.8)',   // Verde escuro - Muito satisfeito
                    'rgba(102, 187, 106, 0.8)',  // Verde claro - Satisfeito
                    'rgba(255, 206, 86, 0.8)',   // Amarelo - Neutro
                    'rgba(255, 152, 0, 0.8)',    // Laranja - Insatisfeito
                    'rgba(244, 67, 54, 0.8)'     // Vermelho - Muito insatisfeito
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: document.body.classList.contains('dark-theme') ? '#FFFFFF' : '#000000',
                        padding: 10,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.parsed} avaliações`;
                        }
                    }
                }
            }
        }
    });
}

async function updateChartData(weeklyData, monthlyData, feedbackData) {
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

    if (feedbackData) {
        feedbackChart.data.labels = feedbackData.labels;
        feedbackChart.data.datasets[0].data = feedbackData.data;
        feedbackChart.update('none');
    }
}

function updateChartsTheme(isDark) {
    const chartColor = isDark ? 
        { bg: 'rgba(75, 192, 192, 0.6)', border: 'rgba(75, 192, 192, 1)' } : 
        { bg: 'rgba(54, 162, 235, 0.5)', border: 'rgba(54, 162, 235, 1)' };
    
    const textColor = isDark ? '#FFFFFF' : '#000000';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    // Update daily chart
    dailyProblemsChart.data.datasets[0].backgroundColor = chartColor.bg;
    dailyProblemsChart.data.datasets[0].borderColor = chartColor.border;
    dailyProblemsChart.options.scales.y.ticks.color = textColor;
    dailyProblemsChart.options.scales.x.ticks.color = textColor;
    dailyProblemsChart.options.scales.y.grid.color = gridColor;
    
    // Update monthly chart
    monthlyProblemsChart.options.plugins.legend.labels.color = textColor;
    
    // Update feedback chart
    feedbackChart.options.plugins.legend.labels.color = textColor;
    
    // Apply updates
    dailyProblemsChart.update();
    monthlyProblemsChart.update();
    feedbackChart.update();
}

window.Charts = {
    init: initCharts,
    updateData: updateChartData,
    updateTheme: updateChartsTheme
};
