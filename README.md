# Wallet Landing Page

A secure web application for managing cryptocurrency wallets.

## Security Notice

This repository contains sensitive operations related to cryptocurrency wallets. Please ensure you follow all security best practices when deploying or contributing to this project.

## Features

- Secure wallet creation and management
- Polygon (MATIC) and MZS token support
- Real-time balance tracking
- Token transfer functionality
- Secure authentication system
- Password recovery system

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase account
- Environment variables (see Setup section)

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd landingpage
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Set up environment variables:
   - Copy `.env.example` to `.env.local`
   - Fill in the required environment variables:
     - `FIREBASE_PROJECT_ID`
     - `FIREBASE_CLIENT_EMAIL`
     - `FIREBASE_PRIVATE_KEY`
     - `NEXT_PUBLIC_POLYGON_RPC_URL`
     - Other required variables

4. Run the development server:
```bash
npm run dev
# or
yarn dev
```

## Environment Variables

The following environment variables are required:

- `FIREBASE_PROJECT_ID`: Your Firebase project ID
- `FIREBASE_CLIENT_EMAIL`: Firebase client email
- `FIREBASE_PRIVATE_KEY`: Firebase private key
- `NEXT_PUBLIC_POLYGON_RPC_URL`: Polygon network RPC URL
- Additional variables as needed

## Security Considerations

1. Never commit sensitive files:
   - `.env.local` and other environment files
   - Private keys
   - API keys
   - Firebase credentials

2. Keep your dependencies updated
3. Follow security best practices for handling private keys
4. Use environment variables for all sensitive data

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions, please open an issue in the repository.

## Acknowledgments

- [Next.js](https://nextjs.org/)
- [Ethers.js](https://docs.ethers.org/)
- [Firebase](https://firebase.google.com/)
- [Polygon Network](https://polygon.technology/) 