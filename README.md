# WhatsApp Support Chatbot 🤖

An enterprise-grade WhatsApp chatbot system designed for educational institutions, featuring automated technical support, ticket management, and a real-time administrative dashboard.

## 🌟 Overview

This system streamlines technical support operations by:
- Automating support ticket creation and management
- Providing real-time monitoring and analytics
- Managing support staff workload
- Collecting quality metrics and feedback

## 🛠 Technical Stack

- **Backend**
  - Node.js + Express.js
  - PostgreSQL + Sequelize ORM
  - WebSocket for real-time communications
  - WhatsApp Business API integration

- **Frontend**
  - Chart.js for analytics
  - Socket.io for real-time updates

## 📋 Features

### Core Functionality
- **Ticket System**
  ```
  PENDING → ACTIVE → WAITING → COMPLETED
  ```
- **Queue Management**
  - Dynamic position tracking
  - Priority handling
  - Auto-assignment

### Analytics & Reporting
- Support quality metrics (1-5 stars)
- Response time tracking
- Staff performance monitoring
- Custom report generation (PDF/Excel)

## ⚙️ Installation

### Prerequisites
```bash
Node.js >= 14.x
PostgreSQL >= 12
WhatsApp Business API credentials
```

### Setup Steps
```bash
# 1. Clone repository
git clone https://github.com/syze77/Chatbot.git
cd Chatbot

# 2. Install dependencies
npm install

# 3. Start application
npm run start   
```

## 🔧 Configuration

### Environment Variables
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chatbot
DB_USER=your_user
DB_PASS=your_password


## 👩‍💻 Development

### Available Scripts
```bash
npm run dist     # Start build application
npm start        # Start application
npm run dev      # Start both with hot reload
```

## 🤝 Contributing

Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting PRs.

## 📞 Support

- Technical Issues: [GitHub Issues](https://github.com/syze77/Chatbot/issues)
- Email Support: gabrielthalles19@gmail.com

## 📄 License

MIT License - [LICENSE](LICENSE)
