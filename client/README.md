# RetailPro POS Frontend

Modern React-based Point of Sale (POS) system with real-time inventory, payment processing, and Zoho Books integration.

## Features

- 🛒 **Sales Management** - Complete POS workflow with cart, checkout, and receipt generation
- 👥 **Customer Management** - View and manage customers synced from Zoho Books
- 📊 **Reports & Analytics** - Sales reports with visual charts and transaction history
- 🔄 **Zoho Books Integration** - Automatic sync of items, customers, and sales receipts
- 💳 **Payment Processing** - Support for cash, card (with PAX terminal), and mobile payments
- 🖨️ **Receipt Printing** - WiFi thermal printer support with automatic receipt generation
- ⚙️ **Settings & Configuration** - Database settings, printer config, and sync diagnostics

## Tech Stack

- **React 18** - Modern React with hooks
- **React Router 7** - Client-side routing
- **Vite** - Fast build tool and dev server
- **Axios** - HTTP client for API calls
- **CSS Variables** - Theming and consistent styling

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Backend server running on port 3000 (or configure `VITE_API_BASE_URL`)

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The app will run on `http://localhost:5000` by default.

## Environment Variables

Create a `.env` file in the client directory (optional):

```env
# API Base URL - Leave empty to use proxy
VITE_API_BASE_URL=

# Database Setting - 'local' or 'cloud'
VITE_DATABASE_SETTING=cloud
```

## Project Structure

```
client/
├── src/
│   ├── components/     # Reusable UI components
│   │   ├── Cart.jsx
│   │   ├── ItemSelector.jsx
│   │   ├── PaymentModal.jsx
│   │   ├── ReceiptScreen.jsx
│   │   ├── TopNavigation.jsx
│   │   ├── Toast.jsx
│   │   ├── ToastContainer.jsx
│   │   ├── ErrorBoundary.jsx
│   │   ├── DatabaseSettings.jsx
│   │   └── ZohoSyncDiagnostic.jsx
│   ├── pages/          # Page components
│   │   ├── Login.jsx
│   │   ├── POSScreen.jsx
│   │   ├── Customers.jsx
│   │   ├── Reports.jsx
│   │   └── Settings.jsx
│   ├── context/        # React Context providers
│   │   └── AuthContext.jsx
│   ├── services/       # API services
│   │   └── api.js
│   ├── config/         # Configuration files
│   │   └── database.js
│   ├── App.jsx         # Main app component
│   ├── main.jsx        # Entry point
│   └── index.css       # Global styles
├── vite.config.js      # Vite configuration
├── package.json        # Dependencies
└── index.html          # HTML template
```

## Key Features Explained

### Authentication

The app uses JWT token authentication stored in localStorage. The `AuthContext` provider manages the authentication state across the app.

### API Integration

All API calls go through Axios interceptors that:
- Automatically attach JWT tokens
- Handle 401 errors (redirect to login)
- Format error messages consistently

### Routing

- `/login` - Public route for authentication
- `/sales` - Main POS screen (protected)
- `/customers` - Customer directory (protected)
- `/reports` - Sales analytics (protected)
- `/settings` - System settings (protected)

### Payment Processing

Supports multiple payment methods:
- **Cash** - Simple cash handling with change calculation
- **Card** - Manual card entry or PAX terminal integration
- **Mobile** - Mobile payment gateway integration

### Zoho Integration

- **Automatic Sync**: Disabled; trigger sync manually when needed
- **Manual Sync**: Available via "Sync Zoho" button
- **Sales Receipts**: Automatically created in Zoho Books after each sale
- **Sync Diagnostics**: View sync status and retry failed syncs

### Receipt Printing

- Automatic printing after sale completion
- WiFi thermal printer support (default port 9100)
- PDF download option for backup
- Print status indicator in navigation

## Styling

The app uses a custom CSS framework with:
- CSS variables for theming
- Touch-friendly button sizes (48px minimum)
- Responsive grid layouts
- Consistent spacing and shadows
- Inter font family

## Development

### Code Style

- Functional components with hooks
- Inline styles for component-specific styling
- CSS classes for reusable patterns
- PropTypes not used (consider adding TypeScript)

### State Management

- Local component state with `useState`
- Global auth state with Context API
- No external state management (Redux, Zustand, etc.)

### Error Handling

- `ErrorBoundary` component catches React errors
- API errors displayed via toast notifications
- Graceful fallbacks for missing data

## Common Issues

### Port Already in Use

If port 5000 is occupied, change the port in `vite.config.js`:

```js
server: {
  port: 5001, // Change to any available port
}
```

### API Connection Issues

Ensure the backend is running and accessible. Check:
1. Backend server is running on port 3000
2. CORS is configured correctly in backend
3. `VITE_API_BASE_URL` is set (if not using proxy)

### Printer Not Working

1. Verify printer is on the same network
2. Check printer IP configuration in Settings
3. Ensure port 9100 is accessible
4. Test connection using the "Test Print" button

## Building for Production

```bash
# Build optimized production bundle
npm run build

# Output will be in ./dist directory
# Serve with any static file server
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

MIT

## Support

For issues or questions, please contact the development team.

