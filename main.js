require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const fs = require("fs");

// Initialize Firebase
const serviceAccount = JSON.parse(fs.readFileSync("./thegiftingaffair-firebase-adminsdk-fbsvc-f880aa0a56.json", "utf-8"));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3000;

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
        from: process.env.EMAIL_USER,
        to,
        subject,
        text: body,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${to}`);
    } catch (error) {
        console.error("❌ Error sending email:", error);
    }
}

// Firestore Listener: Watches for order status changes
async function watchOrders() {
    db.collection("orders").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            const order = change.doc.data();
            const orderId = change.doc.id;
            const email = order.billingAddress?.email;

            // Format delivery date
            const deliveryDate = order.deliveryDate ? 
                new Date(order.deliveryDate.seconds * 1000).toLocaleDateString('en-SG', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                }) : 'To be confirmed';

            if (change.type === "modified" && email) {
                // Get the previous state
                const previousOrder = change.doc.previous?.data();

                // Check for payment confirmation (only if it changed from false to true)
                if (order.paymentStatus?.adminConfirmed && 
                    (!previousOrder || previousOrder.paymentStatus?.adminConfirmed !== true)) {
                    await sendEmail(
                        email,
                        "The Gifting Affair - Payment Confirmation",
                        `Dear ${order.billingAddress.firstName},

Thank you for your order with The Gifting Affair. We are pleased to confirm that your payment has been successfully received and processed.

Order Details:
- Order ID: ${orderId}
- Expected Delivery Date: ${deliveryDate}
- Total Amount: $${order.total}

Order Items:
${order.items.map(item => `- ${item.quantity}x ${item.name} ($${item.price})`).join('\n')}

Delivery Address:
${order.shippingAddress.address}
${order.shippingAddress.city}
${order.shippingAddress.state} ${order.shippingAddress.pincode}

We will notify you once your order has been dispatched for delivery. If you have any questions about your order, please don't hesitate to contact us.

Best regards,
The Gifting Affair Team`
                    );
                }

                // Check for delivery confirmation (only if it changed from false to true)
                if (order.tracking?.isDelivered && 
                    (!previousOrder || previousOrder.tracking?.isDelivered !== true)) {
                    await sendEmail(
                        email,
                        "The Gifting Affair - Delivery Confirmation",
                        `Dear ${order.billingAddress.firstName},

We are pleased to inform you that your order has been successfully delivered.

Order Details:
- Order ID: ${orderId}
- Delivery Date: ${new Date().toLocaleDateString('en-SG')}

We hope your gifting experience with us has been satisfactory. If you have any feedback or concerns, please don't hesitate to reach out to us.

Thank you for choosing The Gifting Affair.

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

// Start Express Server
app.get("/", (req, res) => {
    res.send("✅ Order Email Service is running...");
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
