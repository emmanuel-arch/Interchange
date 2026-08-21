import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding users and trading profiles...\n");

  const password = await bcrypt.hash("Test@1234", 12);

  // ── Super Admin ──────────────────────────────────────────
  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@birgenai.com" },
    update: {},
    create: {
      email: "admin@birgenai.com",
      name: "Super Admin",
      hashedPassword: password,
      phone: "+254700000001",
      role: "SUPER_ADMIN",
      tier: "ENTERPRISE_ADVANCED",
      isActive: true,
    },
  });
  await prisma.tradingProfile.upsert({
    where: { userId: superAdmin.id },
    update: {},
    create: {
      userId: superAdmin.id,
      tradingRole: "SUPER_ADMIN",
      kycStatus: "APPROVED",
      isApproved: true,
    },
  });
  console.log(`✅ Super Admin: admin@birgenai.com`);

  // ── Admin ────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: "manager@birgenai.com" },
    update: {},
    create: {
      email: "manager@birgenai.com",
      name: "Admin Manager",
      hashedPassword: password,
      phone: "+254700000002",
      role: "ADMIN",
      tier: "ENTERPRISE_BASIC",
      isActive: true,
    },
  });
  await prisma.tradingProfile.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      tradingRole: "SUPER_ADMIN",
      kycStatus: "APPROVED",
      isApproved: true,
    },
  });
  console.log(`✅ Admin: manager@birgenai.com`);

  // ── Investor (Approved) ──────────────────────────────────
  const investor = await prisma.user.upsert({
    where: { email: "investor@birgenai.com" },
    update: {},
    create: {
      email: "investor@birgenai.com",
      name: "John Investor",
      hashedPassword: password,
      phone: "+254700000003",
      role: "INDIVIDUAL",
      tier: "PREMIUM",
      isActive: true,
    },
  });
  await prisma.tradingProfile.upsert({
    where: { userId: investor.id },
    update: {},
    create: {
      userId: investor.id,
      tradingRole: "INVESTOR",
      kycStatus: "APPROVED",
      isApproved: true,
    },
  });
  console.log(`✅ Investor (approved): investor@birgenai.com`);

  // ── Investor (Pending KYC) ───────────────────────────────
  const pendingInvestor = await prisma.user.upsert({
    where: { email: "pending@birgenai.com" },
    update: {},
    create: {
      email: "pending@birgenai.com",
      name: "Jane Pending",
      hashedPassword: password,
      phone: "+254700000004",
      role: "INDIVIDUAL",
      tier: "FREE",
      isActive: true,
    },
  });
  await prisma.tradingProfile.upsert({
    where: { userId: pendingInvestor.id },
    update: {},
    create: {
      userId: pendingInvestor.id,
      tradingRole: "INVESTOR",
      kycStatus: "PENDING",
      isApproved: false,
    },
  });
  console.log(`✅ Investor (pending): pending@birgenai.com`);

  // ── Subscriber ───────────────────────────────────────────
  const subscriber = await prisma.user.upsert({
    where: { email: "subscriber@birgenai.com" },
    update: {},
    create: {
      email: "subscriber@birgenai.com",
      name: "Mike Subscriber",
      hashedPassword: password,
      phone: "+254700000005",
      role: "INDIVIDUAL",
      tier: "INDIVIDUAL",
      isActive: true,
    },
  });
  await prisma.tradingProfile.upsert({
    where: { userId: subscriber.id },
    update: {},
    create: {
      userId: subscriber.id,
      tradingRole: "SUBSCRIBER",
      kycStatus: "APPROVED",
      isApproved: true,
    },
  });
  console.log(`✅ Subscriber: subscriber@birgenai.com`);

  // ── Default Pool ─────────────────────────────────────────
  const pool = await prisma.pool.upsert({
    where: { id: "default-pool" },
    update: {},
    create: {
      id: "default-pool",
      name: "GoldStrike Main Pool",
      description: "Primary XAUUSD trading pool",
      totalCapital: 50000,
      currentValue: 52500,
      isActive: true,
    },
  });
  console.log(`✅ Pool: ${pool.name}`);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔑 All accounts use password: Test@1234
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📧 admin@birgenai.com      (Super Admin)
  📧 manager@birgenai.com    (Admin)
  📧 investor@birgenai.com   (Investor - Approved)
  📧 pending@birgenai.com    (Investor - Pending KYC)
  📧 subscriber@birgenai.com (Subscriber)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
