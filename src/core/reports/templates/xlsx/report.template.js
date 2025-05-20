const ExcelJS = require('exceljs');

async function generateXLSXReport(problems, startDate, endDate) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatório de Atendimentos');

    // Configure cabeçalhos
    worksheet.columns = [
        { header: 'Data', key: 'formatted_date', width: 20 },
        { header: 'Nome', key: 'name', width: 30 },
        { header: 'Cargo', key: 'position', width: 20 },
        { header: 'Cliente', key: 'city', width: 25 },
        { header: 'Escola', key: 'school', width: 35 },
        { header: 'Atendente', key: 'attendant_id', width: 20 },
        { header: 'Card', key: 'card_link', width: 45 },
        { header: 'Status Card', key: 'card_status', width: 20 },
        { header: 'Duração', key: 'duration_minutes', width: 15 },
        { header: 'Descrição', key: 'description', width: 50 }
    ];

    // Estilizar cabeçalhos
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF3498DB' }
    };
    worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    // Adicionar dados
    problems.forEach(problem => {
        worksheet.addRow({
            formatted_date: problem.formatted_date,
            name: problem.name,
            position: problem.position,
            city: problem.city,
            school: problem.school,
            attendant_id: problem.attendant_id,
            card_link: problem.card_link,
            card_status: problem.card_status,
            duration_minutes: formatDuration(problem.duration_minutes),
            description: problem.description
        });
    });

    // Ajustar células
    worksheet.getColumn('card_link').eachCell({ includeEmpty: true }, cell => {
        cell.hyperlink = cell.value !== 'Não foi necessário' ? cell.value : null;
        if (cell.hyperlink) {
            cell.font = { color: { argb: 'FF0000FF' }, underline: true };
        }
    });

    return workbook;
}

function formatDuration(minutes) {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? 
        mins > 0 ? `${hours}h${mins}min` : `${hours}h` :
        `${mins}min`;
}

module.exports = { generateXLSXReport };
