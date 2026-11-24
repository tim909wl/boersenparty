import { DatabaseService } from '../database/database.service.js';const db=new DatabaseService();db.migrate();db.onModuleDestroy();console.log('Database migrated.');
