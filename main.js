require("dotenv").config();
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

// Initialize Firebase Admin SDK with credentials from environment variable m
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Configure Nodemailer
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Function to send an email h
async function sendEmail(to, subject, body) {
    const mailOptions = {
        from: `"The Gifting Affair" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text: body,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${to}: ${subject}`);
    } catch (error) {
        console.error("❌ Error sending email:", error);
    }
}

// Firestore Listener: Watches for order status changes
async function watchOrders() {
    console.log("👀 Watching Firestore orders for updates...");

    db.collection("orders").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            const order = change.doc.data();
            const orderId = change.doc.id;
            const email = order.billingAddress?.email;

            if (!email) return; // Skip if email is missing

            // Format delivery date
            const deliveryDate = order.deliveryDate
                ? new Date(order.deliveryDate.seconds * 1000).toLocaleDateString("en-SG", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                  })
                : "To be confirmed";

            if (change.type === "modified") {
                const previousOrder = change.doc.previous?.data() || {};

                // Check for payment confirmation (changed from false to true)
                if (
                    order.paymentStatus?.adminConfirmed &&
                    previousOrder.paymentStatus?.adminConfirmed !== true
                ) {
                    console.log(`💰 Payment confirmed for Order ID: ${orderId}`);

                    await sendEmail(
                        email,
                        "The Gifting Affair - Payment Confirmation",
                        `Dear ${order.billingAddress.firstName},

Thank you for your order with The Gifting Affair. We have received your payment.

📦 Order ID: ${orderId}
📅 Expected Delivery Date: ${deliveryDate}
💵 Total Amount: $${order.total}

Order Items:
${order.items.map((item) => `- ${item.quantity}x ${item.name} ($${item.price})`).join("\n")}

Delivery Address:
${order.shippingAddress.address}
${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.pincode}

We will notify you once your order is shipped. 

Best regards,  
The Gifting Affair Team`
                    );
                }

                // Check for delivery confirmation (changed from false to true)
                if (
                    order.tracking?.isDelivered &&
                    previousOrder.tracking?.isDelivered !== true
                ) {
                    console.log(`🚚 Order delivered: ${orderId}`);

                    await sendEmail(
                        email,
                        "The Gifting Affair - Delivery Confirmation",
                        `Dear ${order.billingAddress.firstName},

Your order has been successfully delivered! 🎁

📦 Order ID: ${orderId}
📅 Delivered on: ${new Date().toLocaleDateString("en-SG")}

We hope you enjoy your purchase! Let us know if you have any feedback.

Best regards,  
The Gifting Affair Team`
                    );
                }
            }
        });
    });
}

// Start Firestore Listener
watchOrders();
