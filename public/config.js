// Deluxe Main lives on Vercel. Its /api addresses are passed on by Vercel
// (vercel.json) to the Deluxe data server, so the pages simply ask their own
// address. The local dev server answers /api itself.
window.DELUXE_MAIN_API = '';
