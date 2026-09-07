# project-dev-vat-non-prod-01
This is our personal space to store Codes. Me and Vatsal will share this as cloud repository for smooth development of our new project.

# Here is an LLM generated short readme file.

# 💍 Radha – Bangles & Jewellery E-Commerce Platform

A full-stack e-commerce platform for **Radha – Bangles & Jewellery**, designed for bridal jewellery, cosmetics, and fashion accessories. The application provides a modern customer shopping experience along with a powerful admin dashboard for inventory, category, and order management.

---

# ✨ Features

## 👤 Customer Features

- User Registration & Login (JWT Authentication)
- Browse Products
- Product Categories
- Product Search using Keywords
- Wishlist
- Shopping Cart
- Checkout
- Order Placement
- Order History (Planned)
- Responsive UI

---

## 👑 Admin Features

### Product Management

- Create Products
- Edit Products
- Delete Products
- Product Image Support
- Product Keywords
- Stock Management
- Price Management

---

### Category Management

- Create Categories
- Manage Categories
- Assign Multiple Categories to a Product
- Dynamic Category Loading

---

### Order Management

- View Orders
- View Customer Information
- Order Status Management

Supported Status:

- Pending
- Shipped
- Delivered
- Cancelled

---

## 📊 Upcoming Features

- Inventory Automation
- Low Stock Alerts
- Dashboard Analytics
- Sales Reports
- Customer Management
- Coupon System
- Payment Gateway Integration
- Product Reviews
- Email Notifications
- Image Upload with Multer
- Advanced Search & Filters

---

# 🏗 Tech Stack

## Frontend

- HTML5
- CSS3
- JavaScript (Vanilla)

---

## Backend

- Node.js
- Express.js

---

## Database

- PostgreSQL

---

## ORM

- Prisma ORM

---

## Authentication

- JWT (JSON Web Token)
- bcrypt

---

## Development Tools

- Nodemon
- Prisma Studio
- Postman

---

# 📁 Project Structure

```
Rajeshwari-Frontend/

│
├── index.html
├── admin.html
├── style.css
├── script.js
├── uploads/
└── assets/

------------------------------------------------

Rajeshwari-Backend/

│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── src/
│   ├── routes/
│   │
│   ├── middleware/
│   │
│   ├── config/
│   │
│   └── index.js
│
├── uploads/
│
├── package.json
│
└── .env
```

---

# 🗄 Database Schema

Main Models

- User
- Product
- Category
- ProductCategory
- Cart
- Wishlist
- Order
- OrderItem

Relationships

```
User
 ├── Cart
 ├── Wishlist
 └── Orders

Product
 ├── Categories (Many-to-Many)
 └── OrderItems

Category
 └── Products (Many-to-Many)

Order
 └── OrderItems
```

---

# 🔐 Authentication

The application uses JWT authentication.

Roles:

- CUSTOMER
- ADMIN

Protected Routes:

```
POST /products
PUT /products/:id
DELETE /products/:id

GET /orders
PUT /orders/:id/status
```

---

# 📦 API Endpoints

## Authentication

```
POST /auth/register
POST /auth/login
```

---

## Products

```
GET    /products
POST   /products
PUT    /products/:id
DELETE /products/:id
```

---

## Categories

```
GET    /categories
POST   /categories
```

---

## Cart

```
GET    /cart
POST   /cart
PUT    /cart/:id
DELETE /cart/:id
```

---

## Wishlist

```
GET    /wishlist
POST   /wishlist
DELETE /wishlist/:id
```

---

## Orders

```
POST   /checkout

GET    /orders

PUT    /orders/:id/status
```

---

# 🚀 Installation

## Clone Repository

```bash
git clone <repository-url>
```

---

## Backend

```bash
cd Rajeshwari-Backend

npm install
```

---

## Environment Variables

Create a `.env` file.

Example:

```env
DATABASE_URL="postgresql://<username>:<password>@<neon-db-url>/<dbname>?sslmode=require"

JWT_SECRET="your_secret_key"

PORT=5000

# Product image storage (Cloudinary) — required, see "Product Images" below
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"
```

> **Credential handling**: `.env` is git-ignored and must never be committed —
> only `.env.example` (placeholders) is tracked. The Cloudinary keys above
> come from your Cloudinary dashboard (Settings → API Keys). For the
> deployed backend, set the same three variables in the Render dashboard's
> environment variables for this service — `.env` on your machine never
> reaches Render on its own.

---

## Prisma

```bash
npx prisma migrate dev

npx prisma generate
```

---

## Run Backend

```bash
npm run dev
```

---

## Frontend

Open using VS Code Live Server:

```
http://localhost:5500
```

---

# 👑 Admin Login

Example Development Account

```
Email:
<set-your-admin-email>

Password:
<set-your-admin-password>
```

> **Note**: For security, do not push your `.env` or hardcoded credentials to this repository. You can reset the admin password by configuring `ADMIN_EMAIL` and `ADMIN_PASSWORD` in your `.env` file and running `node resetAdminPassword.js`.

---

# 📷 Product Images

Uploaded product images are stored on **Cloudinary**, not on the backend's
local disk. This matters because Render's filesystem is ephemeral — a file
written to local disk at runtime is wiped on the next restart/redeploy, so
local storage silently lost every admin-uploaded image. Cloudinary URLs
(`https://res.cloudinary.com/...`) are absolute and independent of the
backend process, so they survive restarts.

The 6 product images that survived from an earlier data migration have
been moved to Cloudinary too, so every product's `image` field is now
either a Cloudinary URL or empty — none should point at local `/uploads/`
going forward. The `/uploads` static route is kept only for backward
compatibility with any old link still floating around; new uploads (via
the admin panel's image picker) always go to Cloudinary.

---

# 📌 Current Project Status

## Completed

- User Authentication
- Admin Authentication
- Product CRUD
- Category CRUD
- Many-to-Many Product Categories
- Shopping Cart
- Wishlist
- Checkout
- Order Creation
- Order Status Management
- Responsive Product Listing
- Modern Admin Dashboard

---

## In Progress

- Order Details View
- Inventory Automation
- Dashboard Analytics
- Product Search
- Customer Management

---

# 🎯 Future Roadmap

- Payment Gateway (Razorpay / Stripe)
- Invoice Generation
- Sales Dashboard
- Product Reviews
- Discounts & Coupons
- Product Variants
- Image Gallery
- Email Notifications
- SMS Notifications
- Inventory Reports
- Vendor Management
- Multi-Admin Support

---

# 👨‍💻 Developed By

**Vatsal Patwa**

MS Library & Information Science  
Indian Statistical Institute, Bangalore

---

# 📄 License

This project is developed for educational and portfolio purposes.
