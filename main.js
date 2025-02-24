require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000; // Use Render's assigned port

// Initialize Firebase Admin SDK
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

// Function to send an email
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

// Firestore Listener
async function watchOrders() {
    console.log("👀 Watching Firestore orders for updates...");

    db.collection("orders").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            const order = change.doc.data();
            const orderId = change.doc.id;
            const email = order.billingAddress?.email;

            if (!email) return;

            const deliveryDate = order.deliveryDate
                ? new Date(order.deliveryDate.seconds * 1000).toLocaleDateString("en-SG", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                  })
                : "To be confirmed";

            if (change.type === "modified") {
                const previousOrder = change.doc.previous?.data() || {};

                if (
                    order.paymentStatus?.adminConfirmed &&
                    previousOrder.paymentStatus?.adminConfirmed !== true
                ) {
                    console.log(`💰 Payment confirmed for Order ID: ${orderId}`);

                    await sendEmail(
                        email,
                        "The Gifting Affair - Payment Confirmation",
                        `Dear ${order.billingAddress.firstName},\n\nThank you for your order. We have received your payment.\n\n📦 Order ID: ${orderId}\n📅 Expected Delivery: ${deliveryDate}\n💵 Total Amount: $${order.total}\n\nBest regards,\nThe Gifting Affair Team`
                    );
                }

                if (
                    order.tracking?.isDelivered &&
                    previousOrder.tracking?.isDelivered !== true
                ) {
                    console.log(`🚚 Order delivered: ${orderId}`);

                    await sendEmail(
                        email,
                        "The Gifting Affair - Delivery Confirmation",
                        `Dear ${order.billingAddress.firstName},\n\nYour order has been delivered! 🎁\n\n📦 Order ID: ${orderId}\n📅 Delivered on: ${new Date().toLocaleDateString("en-SG")}\n\nBest regards,\nThe Gifting Affair Team`
                    );
                }
            }
        });
    });
}

// Start Firestore Listener
watchOrders();

// Dummy Express route to prevent Render timeout
app.get("/", (req, res) => {
    res.send("Firestore listener is running...");
});

// Keep server running
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
