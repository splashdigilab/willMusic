import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyA7B_7GErQAE7fwM55YCpc1b8_ItKrxOyo",
    authDomain: "willmusic-dd6ae.firebaseapp.com",
    projectId: "willmusic-dd6ae",
    storageBucket: "willmusic-dd6ae.firebasestorage.app",
    messagingSenderId: "1080839138317",
    appId: "1:1080839138317:web:e6ca5d4e0617bec1af3944"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const token = 'test_token_' + Date.now();
const tokenRef = doc(db, 'tokens', token);

setDoc(tokenRef, { status: 'used', createdAt: serverTimestamp() }).then(() => {
    const pendingRef = doc(db, 'queue_pending', token);
    return setDoc(pendingRef, {
        content: 'Testing Fermat GSAP',
        style: {
            backgroundImage: '/svg/bg/bg-3.svg',
            shape: 'square',
            textColor: '#000000',
            textAlign: 'center'
        },
        token: token,
        timestamp: serverTimestamp(),
        status: 'waiting'
    });
}).then(() => {
    console.log('Dummy pending doc created successfully!');
    process.exit(0);
}).catch(console.error);
