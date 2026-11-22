// Firebase web config. Not a secret: it only names the project. Access is guarded by
// App Check, Firestore security rules and API key restrictions.
export const firebaseConfig = {
  apiKey: "AIzaSyDcet8PFXM0WY15CXdqMk_nWg6KSBz08BQ",
  authDomain: "dispatch-hybridai-2026.firebaseapp.com",
  projectId: "dispatch-hybridai-2026",
  storageBucket: "dispatch-hybridai-2026.firebasestorage.app",
  messagingSenderId: "155617141083",
  appId: "1:155617141083:web:70377e2e0c5e538c383a7e",
};

// reCAPTCHA Enterprise site key for App Check in the deployed app. Public by design (it is sent to every browser).
export const recaptchaEnterpriseSiteKey = '6LeRDCwuAAAAANucgvKLQVei_3-4YmhrVj9cE_u9';
