const { MikroORM } = require('@mikro-orm/core');
const argon = require('argon2');
// ensure relative paths in mikro-orm.config resolve to the backend folder
process.chdir(__dirname);
const ormConfigModule = require('./dist/mikro-orm.config');
const ormConfig = ormConfigModule.default || ormConfigModule;

async function run() {
  const { User } = require('./dist/entities/user.entity');
  const { Role } = require('./dist/entities/enums/role.enum');

  const cfg = Object.assign({}, ormConfig, { entities: [User] });
  const orm = await MikroORM.init(cfg);
  const em = orm.em.fork();

  let admin = await em.findOne(User, { email: 'admin@launchup.local' });
  if (admin) {
    console.log('Admin already exists:', admin.email);
    await orm.close(true);
    process.exit(0);
  }

  const hash = await argon.hash('password123');
  admin = em.create(User, {
    email: 'admin@launchup.local',
    hash,
    firstName: 'Admin',
    lastName: 'User',
    role: Role.Admin,
  });

  await em.persistAndFlush(admin);
  console.log('Created admin: admin@launchup.local (password: password123)');

  await orm.close(true);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
