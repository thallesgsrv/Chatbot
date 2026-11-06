import { isDark } from '../../shared/theme.js';

/** Gráficos do dashboard (Chart.js carregado localmente em window.Chart). */

const PIE_PALETTE = [
    'rgba(75, 192, 192, 0.8)', 'rgba(54, 162, 235, 0.8)', 'rgba(255, 206, 86, 0.8)', 'rgba(153, 102, 255, 0.8)',
    'rgba(255, 159, 64, 0.8)', 'rgba(255, 99, 132, 0.8)', 'rgba(0, 200, 83, 0.8)', 'rgba(255, 87, 34, 0.8)',
    'rgba(0, 188, 212, 0.8)', 'rgba(233, 30, 99, 0.8)', 'rgba(205, 220, 57, 0.8)', 'rgba(121, 85, 72, 0.8)',
];
// do mais satisfeito (verde) ao mais insatisfeito (vermelho)
const FEEDBACK_COLORS = [
    'rgba(75, 192, 192, 0.8)', 'rgba(102, 187, 106, 0.8)', 'rgba(255, 206, 86, 0.8)',
    'rgba(255, 152, 0, 0.8)', 'rgba(244, 67, 54, 0.8)',
];
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];

const textColor = () => (isDark() ? '#e9ecef' : '#000000');
const gridColor = () => (isDark() ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)');

const canvas = (id) => document.getElementById(id).getContext('2d');

const pieOptions = (tooltipLabel) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { position: 'bottom', labels: { color: textColor(), padding: 10 } },
        tooltip: { callbacks: { label: tooltipLabel } },
    },
});

export function createCharts() {
    const daily = new Chart(canvas('dailyProblemsChart'), {
        type: 'bar',
        data: {
            labels: WEEKDAYS,
            datasets: [{
                label: 'Atendimentos Concluídos', data: [], backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1, borderRadius: 5, maxBarThickness: 50,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, color: textColor() }, grid: { color: gridColor() } },
                x: { ticks: { color: textColor() }, grid: { display: false } },
            },
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: 'rgba(0, 0, 0, 0.8)', callbacks: { label: (c) => `Atendimentos concluídos: ${c.parsed.y}` } },
            },
        },
    });

    const monthly = new Chart(canvas('monthlyProblemsChart'), {
        type: 'pie',
        data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
        options: pieOptions((c) => `Atendimentos concluídos ${c.label}: ${c.parsed}`),
    });

    const feedback = new Chart(canvas('feedbackChart'), {
        type: 'pie',
        data: { labels: [], datasets: [{ data: [], backgroundColor: FEEDBACK_COLORS }] },
        options: pieOptions((c) => `${c.label}: ${c.parsed} avaliações`),
    });

    return {
        update({ weekly, monthly: monthlyData, feedback: feedbackData }) {
            daily.data.datasets[0].data = weekly.data.map((d) => d.completed);

            const months = monthlyData.data
                .map((d, i) => ({ label: monthlyData.labels[i], value: d.completed }))
                .filter((d) => d.value > 0); // só meses com atendimentos
            monthly.data.labels = months.map((m) => m.label);
            monthly.data.datasets[0].data = months.map((m) => m.value);
            monthly.data.datasets[0].backgroundColor = months.map((_, i) => PIE_PALETTE[i % PIE_PALETTE.length]);

            feedback.data.labels = feedbackData.labels;
            feedback.data.datasets[0].data = feedbackData.data;

            [daily, monthly, feedback].forEach((chart) => chart.update('none'));
        },

        /** Reaplica as cores de texto/grade quando o tema muda (antes ficavam sempre pretas). */
        applyTheme() {
            daily.options.scales.y.ticks.color = textColor();
            daily.options.scales.y.grid.color = gridColor();
            daily.options.scales.x.ticks.color = textColor();
            [monthly, feedback].forEach((chart) => { chart.options.plugins.legend.labels.color = textColor(); });
            [daily, monthly, feedback].forEach((chart) => chart.update('none'));
        },
    };
}
