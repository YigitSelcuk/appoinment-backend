#!/bin/bash

# Production Deployment Script for Appointment App Backend
# Bu script backend'i production sunucusuna deploy eder

set -e  # Hata durumunda scripti durdur

echo "🚀 Starting Backend Production Deployment..."

# Renk kodları
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonksiyonlar
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Gerekli dizinleri oluştur
create_directories() {
    print_status "Creating necessary directories..."
    mkdir -p logs
    mkdir -p uploads
    mkdir -p temp
    print_success "Directories created successfully"
}

# Node.js ve npm versiyonlarını kontrol et
check_node_version() {
    print_status "Checking Node.js version..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed!"
        exit 1
    fi
    
    NODE_VERSION=$(node --version)
    print_success "Node.js version: $NODE_VERSION"
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed!"
        exit 1
    fi
    
    NPM_VERSION=$(npm --version)
    print_success "npm version: $NPM_VERSION"
}

# Dependencies'leri yükle
install_dependencies() {
    print_status "Installing production dependencies..."
    npm ci --only=production
    print_success "Dependencies installed successfully"
}

# Environment dosyasını kontrol et
check_environment() {
    print_status "Checking environment configuration..."
    
    if [ ! -f ".env.production" ]; then
        print_error ".env.production file not found!"
        print_warning "Please create .env.production file with production settings"
        exit 1
    fi
    
    # .env.production'ı .env olarak kopyala
    cp .env.production .env
    print_success "Environment configuration loaded"
}

# Database bağlantısını test et
test_database() {
    print_status "Testing database connection..."
    
    # Node.js ile database test scripti çalıştır
    node -e "
        require('dotenv').config();
        const { testConnection } = require('./config/database');
        testConnection().then(() => {
            console.log('✅ Database connection successful');
            process.exit(0);
        }).catch((err) => {
            console.error('❌ Database connection failed:', err.message);
            process.exit(1);
        });
    "
    
    print_success "Database connection test passed"
}

# PM2 kurulumunu kontrol et
check_pm2() {
    print_status "Checking PM2 installation..."
    
    if ! command -v pm2 &> /dev/null; then
        print_warning "PM2 is not installed. Installing PM2..."
        npm install -g pm2
        print_success "PM2 installed successfully"
    else
        PM2_VERSION=$(pm2 --version)
        print_success "PM2 is already installed. Version: $PM2_VERSION"
    fi
}

# Eski PM2 process'lerini durdur
stop_existing_processes() {
    print_status "Stopping existing PM2 processes..."
    
    if pm2 list | grep -q "appointment-backend"; then
        pm2 stop appointment-backend
        pm2 delete appointment-backend
        print_success "Existing processes stopped"
    else
        print_warning "No existing processes found"
    fi
}

# PM2 ile uygulamayı başlat
start_application() {
    print_status "Starting application with PM2..."
    
    # PM2 ecosystem dosyasını kullanarak başlat
    pm2 start ecosystem.config.js --env production
    
    # PM2 startup script'ini kaydet
    pm2 save
    pm2 startup
    
    print_success "Application started successfully"
}

# Uygulama durumunu kontrol et
check_application_status() {
    print_status "Checking application status..."
    
    sleep 5  # Uygulamanın başlaması için bekle
    
    # PM2 status
    pm2 status
    
    # Health check
    if curl -f http://localhost:5000/health > /dev/null 2>&1; then
        print_success "Application is running and healthy"
    else
        print_error "Application health check failed"
        pm2 logs appointment-backend --lines 20
        exit 1
    fi
}

# Log monitoring setup
setup_log_monitoring() {
    print_status "Setting up log monitoring..."
    
    # Log rotation için logrotate konfigürasyonu
    cat > /tmp/appointment-backend-logrotate << EOF
/var/www/appointment-app/backend/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
    
    # Logrotate konfigürasyonunu kopyala (sudo gerekebilir)
    if [ -w /etc/logrotate.d/ ]; then
        cp /tmp/appointment-backend-logrotate /etc/logrotate.d/appointment-backend
        print_success "Log rotation configured"
    else
        print_warning "Could not configure log rotation. Please run with sudo or configure manually."
    fi
}

# Ana deployment fonksiyonu
main() {
    print_status "=== Backend Production Deployment Started ==="
    
    # Deployment adımları
    create_directories
    check_node_version
    check_environment
    install_dependencies
    test_database
    check_pm2
    stop_existing_processes
    start_application
    check_application_status
    setup_log_monitoring
    
    print_success "=== Backend Deployment Completed Successfully ==="
    print_status "Application is running on port 5000"
    print_status "Use 'pm2 logs appointment-backend' to view logs"
    print_status "Use 'pm2 monit' to monitor the application"
}

# Script'i çalıştır
main "$@"