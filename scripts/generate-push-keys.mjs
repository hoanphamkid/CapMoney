import * as webPush from 'web-push';

const keys = webPush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('\n# Add these to server environment variables; never commit the private key.');
console.log('# Set VAPID_SUBJECT=mailto:<your-contact-email> on the same deployments.');
