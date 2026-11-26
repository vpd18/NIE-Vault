# NIE-Vault 🔍
### Cloud-Native Campus Lost and Found Management System

> **Course**: BIS505 – Cloud Computing Experiential Learning  
> **Institution**: The National Institute of Engineering (NIE), Mysuru  
> **Department**: Department of Information Science & Engineering  
> **Contributors**: 
> - **Ved Pranav Das** (`4NI24IS231`) — *Cloud Compute, PaaS Deployment & Operational Monitoring*
> - **Vishnu Kumar** (`4NI24IS233`) — *Cloud Storage, Managed DBaaS & Cloud Security*

---

## Overview

**NIE-Vault** is a centralized, cloud-native lost-and-found web application engineered for college campuses. It empowers students, faculty, and administrative staff to report lost or found belongings with photo evidence, search reported items with full-text indexing, submit ownership claims, communicate via direct messaging, and receive instant real-time notifications.

Originally developed as a monolithic local application, NIE-Vault has been re-architected onto **Amazon Web Services (AWS)** using modern cloud primitives—including **AWS Elastic Beanstalk** for scalable compute, **Amazon S3** for decoupled object storage, **Amazon RDS for MySQL** for managed persistence, and **Amazon CloudWatch** for health monitoring.

---

## Cloud Architecture

```mermaid
flowchart TD
    Client(["👥 Students & Faculty\n(Web Browser)"])

    subgraph AWS_Cloud ["Amazon Web Services (AWS Region: ap-south-1)"]
        subgraph ComputeTier ["Compute & Networking (PaaS)"]
            EB["AWS Elastic Beanstalk\n(Node.js 20 on Amazon Linux 2023)"]
            Nginx["Nginx Reverse Proxy\n(WebSocket Upgrade: /socket.io/)"]
            Procmon["Procfile Process Supervisor\n(web: node server.js)"]
        end

        subgraph StorageTier ["Storage & Data Layer"]
            S3[("Amazon S3 Bucket\nnie-vault-uploads-vpd18\n(Immutable Photo Storage)")]
            RDS[("Amazon RDS MySQL 8.0\nnie-vault-db (db.t3.micro)\n(Relational State & Fulltext Index)")]
        end

        subgraph SecurityMonitoring ["Security & Observability"]
            IAM["AWS IAM\n(Least-Privilege S3 Policies)"]
            CW["Amazon CloudWatch\n(Metrics, Alarms & Log Streams)"]
            SES["SMTP / Amazon SES\n(Transactional Email Delivery)"]
        end
    end

    Client <-->|HTTPS / WSS| Nginx
    Nginx <--> EB
    EB --- Procmon
    EB -->|Direct Buffer Upload (AWS SDK v3)| S3
    EB -->|Pooled SQL Queries (Port 3306)| RDS
    Client -->|Direct Public Read (s3:GetObject)| S3
    EB -.->|CPU & Request Telemetry| CW
    EB -.->|Verification & Reset Emails| SES
    IAM -.->|Scoped Credentials| EB
```

---

## AWS Services Employed

| AWS Service | Architecture Role | Configuration Details |
| :--- | :--- | :--- |
| **AWS Elastic Beanstalk** | PaaS Compute & Hosting | Node.js 20 on 64-bit Amazon Linux 2023; automated runtime management, environment variable injection, and zero-downtime deployment. |
| **Amazon S3** *(Mandatory)* | Cloud Object Storage | Dedicated bucket (`nie-vault-uploads-vpd18`) in `ap-south-1` storing item photos with 11 9's durability; public read policy (`s3:GetObject`). |
| **Amazon RDS (MySQL)** | Managed Relational DBaaS | MySQL Community 8.0 (`db.t3.micro`, 20 GB SSD) in VPC with automated backups, connection pooling, and multi-column `FULLTEXT` index. |
| **Amazon CloudWatch** | Monitoring & Observability | Centralized access logs, CPU utilization graphs, target response times, and real-time application error streaming. |
| **AWS IAM** | Identity & Access Management | Dedicated service identity with fine-grained `AmazonS3FullAccess` policy following the Principle of Least Privilege. |
| **Amazon VPC** | Network Security | Isolated network security group (`nie-vault-db-sg`) authorizing inbound MySQL ingress strictly on port `3306`. |

---

## Key Features

- **College Domain Authentication**: Strict regex-based registration enforcement for NIE institutional emails (`@nie.ac.in`) with cryptographic token verification.
- **Resend Verification Flow**: Built-in verification email dispatch directly from the sign-in page to prevent locked unverified accounts.
- **Decoupled Photo Uploads**: Direct streaming of image buffers to **Amazon S3** via AWS SDK v3 with seamless local disk fallback for offline development.
- **Heuristic Matchmaking Engine**: Multi-attribute algorithm evaluating category, color, location, and description token overlap to proactively notify owners of potential item matches.
- **Full-Duplex Real-Time Notifications**: Socket.io bidirectional event tunnels proxied through Nginx on Elastic Beanstalk, delivering instant claim alerts.
- **Dual Messaging Channels**: Claim-centric verification threads alongside direct user-to-user item chat.
- **Database Inspection Tooling**: Built-in CLI viewer (`node viewDb.js`) for immediate remote RDS query inspection.

---

## Project Structure

```text
NIE-Vault/
├── .platform/                     # AWS Elastic Beanstalk platform extensions
│   └── nginx/conf.d/elasticbeanstalk/
│       └── websocket.conf         # Nginx proxy config for Socket.io WebSockets
├── database/
│   └── schema.sql                 # Master RDS MySQL database migration script
├── middleware/
│   └── auth.js                    # Session authentication guard
├── public/                        # Client-side SPA assets
│   ├── css/style.css              # Custom design system with CSS tokens
│   ├── js/
│   │   ├── app.js                 # Global API utilities & S3 URL resolver
│   │   ├── home.js                # Dashboard telemetry & recent feeds
│   │   ├── item.js                # Detailed item views, claims & chat
│   │   ├── login.js               # Sign-in, registration & resend verification
│   │   ├── notifications.js       # Client Socket.io notification listener
│   │   ├── report.js              # Multipart lost/found reporting
│   │   ├── reset.js               # Password reset token handler
│   │   └── search.js              # Fulltext search & auto-suggestions
│   ├── home.html                  # Main user dashboard
│   ├── item.html                  # Item inspection & claiming interface
│   ├── login.html                 # Authentication & verification interface
│   ├── report.html                # Item reporting form
│   ├── reset.html                 # Password reset page
│   ├── search.html                # Real-time search & filter page
│   └── verify.html                # Account activation landing page
├── routes/                        # Express.js REST API route controllers
│   ├── auth.js                    # Login, registration, token verification & reset
│   ├── claims.js                  # Ownership claim submissions & approval
│   ├── itemMessages.js            # Direct user-to-user item messaging
│   ├── items.js                   # Item CRUD, fulltext search & S3 integration
│   └── notifications.js           # In-app notification persistence endpoints
├── .env.example                   # Environment configuration template
├── .gitignore                     # Git exclusion rules (protects .env & node_modules)
├── db.js                          # MySQL2 connection pool targeting Amazon RDS
├── mailer.js                      # Nodemailer SMTP transport (Gmail / Amazon SES)
├── package.json                   # Project dependencies and npm scripts
├── Procfile                       # Elastic Beanstalk process supervisor command
├── s3.js                          # Dual-mode AWS S3 storage service (SDK v3)
├── server.js                      # Main Express & Socket.io entry point
├── viewDb.js                      # Remote Amazon RDS inspection CLI utility
└── ws.js                          # WebSocket initialization & event dispatcher
```

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v18.x or v20.x LTS installed
- **MySQL Server** (local or Amazon RDS endpoint)
- **AWS Account** (optional for local fallback; required for cloud deployment)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/vpd18/NIE-Vault.git
cd NIE-Vault
npm install
```

### 3. Environment Configuration
Create a `.env` file in the project root by copying the template:
```bash
cp .env.example .env
```
Update `.env` with your credentials:
```env
# Database (Local MySQL or Amazon RDS Endpoint)
DB_HOST=nie-vault-db.czmaq0seovbf.ap-south-1.rds.amazonaws.com
DB_USER=admin
DB_PASSWORD=your_password
DB_NAME=lost_and_found
DB_CONN_LIMIT=10

# Application
PORT=3000
APP_URL=http://localhost:3000
SESSION_SECRET=your-random-session-secret-key

# AWS S3 Storage (Leave blank to use local 'uploads/' folder)
AWS_REGION=ap-south-1
AWS_S3_BUCKET=nie-vault-uploads-vpd18
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key

# Email Notifications (Gmail SMTP or Amazon SES SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_char_app_password
SMTP_FROM="NIE-Vault <your_email@gmail.com>"
```

### 4. Database Setup
Initialize the database tables and default categories on your MySQL/RDS instance:
```bash
# Connect and apply master schema
mysql -h <DB_HOST> -u <DB_USER> -p < database/schema.sql
```
To verify active tables and data in Amazon RDS:
```bash
node viewDb.js
```

### 5. Running the Application
* **Development Mode** (with hot-reload):
  ```bash
  npm run dev
  ```
* **Production Mode**:
  ```bash
  npm start
  ```
Open `http://localhost:3000` (or your configured `PORT`) in your browser.

---

## AWS Cloud Deployment (Elastic Beanstalk)

1. **Package the Application**:
   Create a clean deployment zip excluding `node_modules` and `.env`:
   ```bash
   tar -a -cf nie-vault-deploy.zip --exclude="node_modules" --exclude=".git" --exclude=".env" --exclude="nie-vault-deploy.zip" * .platform
   ```
2. **Configure Elastic Beanstalk**:
   - In the AWS Console, open **Elastic Beanstalk** -> select your environment.
   - Go to **Configuration** -> **Environment properties** and inject `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, etc.
3. **Deploy**:
   - Click **Upload and deploy**, choose `nie-vault-deploy.zip`, and click **Deploy**.
   - Elastic Beanstalk automatically runs `npm install`, launches `node server.js` via `Procfile`, and routes traffic through Nginx with WebSocket support.

---

## Academic Verification & Demonstration

For course viva and evaluation presentations:
- **Member 1 (Compute & Telemetry)**: Demonstrates the live Elastic Beanstalk URL (`...elasticbeanstalk.com`), platform health in the AWS Console, and live CloudWatch telemetry metrics.
- **Member 2 (Storage & Database)**: Demonstrates photo uploads resolved directly to S3 (`...s3.ap-south-1.amazonaws.com`), bucket objects in the S3 console, and real-time RDS data persistence via `node viewDb.js`.

Detailed project reports are available in the repository:
- 📄 [report_ved_pranav_das.md](report_ved_pranav_das.md)
- 📄 [report_vishnu_kumar.md](report_vishnu_kumar.md)

---

## License

This project is developed for educational and institutional use under the **BIS505 Cloud Computing Experiential Learning** curriculum at **The National Institute of Engineering (NIE), Mysuru**.
