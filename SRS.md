# Software Requirements Specification (SRS)

## 1. Introduction
**Project Name**: Radha Bangles & Jewellery (E-commerce Platform)  
**Purpose**: This document provides a blueprint of the product's features, architecture, and current state. It will be incrementally updated as new features are developed.

## 2. System Architecture
- **Frontend**: Vanilla HTML, CSS, JavaScript (Single Page Application paradigm with modals/drawers for interactions).
- **Backend**: Node.js with Express.js.
- **Database**: PostgreSQL managed via Prisma ORM.
- **Authentication**: JWT-based stateless authentication.
- **Email Service**: NodeMailer for transactional emails (e.g., password reset).

## 3. User Roles
1. **Customer**: General users who browse products, manage their cart/wishlist, place orders, and manage their profile.
2. **Delivery Partner**: specialized users responsible for last-mile fulfillment. They can view orders ready for delivery, see customer delivery information, and update the order status to "Out for Delivery", "Attempted", or "Delivered". They do not have access to administrative metrics or the full product catalog.
3. **Admin/Owner**: Privileged users who can access the Admin Console to manage the catalog, view orders, handle customers, and configure store settings.

## 4. Key Features & Requirements

### 4.1. Authentication & Authorization
- **Registration & Login**: Users can create accounts and log in securely via standard email/password or use **Google Sign-In** for a more convenient OAuth2 authentication experience.
- **Password Management**: 
  - Authenticated users can change their passwords.
  - Unauthenticated users can request a password reset link (sent via email) if they forget their password. Time-bound secure tokens are used for verification.
- **Role-Based Access Control**: Admin routes and dashboards are protected and only accessible by users with the `ADMIN` or `OWNER` role. Delivery routes are restricted to the `DELIVERY_PARTNER`, `ADMIN`, or `OWNER` roles.

### 4.2. User Profile Management
- Users can view and update their profile details (Full name, Phone, Pincode, Address, City, State).
- Profile details are used to auto-fill the checkout form.

### 4.3. Catalog Management
- **Products**: Admins can Create, Read, Update, and Delete (CRUD) products. Products have titles, descriptions, prices, stock levels, images, and search keywords.
- **Categories**: Admins can create and manage product categories. Products can be mapped to multiple categories.

### 4.4. Shopping Experience
- **Product Display**: Customers can browse products, view details, and filter/search using keywords.
- **Cart**: Customers can add products to their bag, update quantities, and remove items. The cart is synchronized with the database for logged-in users.
- **Wishlist**: Customers can save favourite items for later.

### 4.5. Checkout & Orders
- **Order Placement**: Customers can place orders from their cart. 
- **Payment Methods**: Currently supports Cash on Delivery (COD). (UPI/Online payment architecture is prepared but temporarily disabled pending gateway integration).
- **Delivery Restrictions**: Admins can toggle a "Pincode Restriction" mode. When enabled, checkout is only allowed for a predefined list of serviceable pincodes.
- **Order Tracking**: Customers can view their past and active orders from their account dashboard.

### 4.6. Admin Console
- **Dashboard KPIs**: Revenue charts, order status distribution, and recent activity.
- **Order Management**: Admins can view order details, update fulfillment statuses (Pending, Dispatched, Delivered, Cancelled), and update payment statuses (Pending, Paid, Refunded).
- **Customer Management**: Admins can view the customer list, see their total spend, and delete accounts if necessary.
- **Store Settings**: Admins can toggle promotional banners and restrict delivery areas.

## 5. Non-Functional Requirements
- **Security**: Passwords are hashed using bcrypt. API routes are protected. Environment variables are strictly validated at boot (failing fast if critical configs like `EMAIL_USER` or `DATABASE_URL` are missing).
- **Performance**: Rate limiting is applied to authentication routes to prevent brute-force attacks.

---
*Note: This document is a living blueprint and will be updated as development continues.*
