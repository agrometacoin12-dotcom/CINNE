import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  // Baseline RBAC roles
  const roles = ['user', 'moderator', 'admin'];
  for (const name of roles) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  // Local development admin (do NOT use these credentials outside dev)
  if (process.env.NODE_ENV !== 'production') {
    const email = 'admin@cinnetemple.local';
    const passwordHash = await argon2.hash('ChangeMe!Dev12345');
    const admin = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash,
        status: 'ACTIVE',
        emailVerified: true,
        profile: { create: { displayName: 'CinneTemple Admin', locale: 'en' } },
      },
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
      update: {},
      create: { userId: admin.id, roleId: adminRole.id },
    });
    console.log(`Seeded dev admin: ${email}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
