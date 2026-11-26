import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Roles } from '../auth/auth.js';
import { DomainError } from '../common/domain-error.js';
import { WristbandImportService } from './wristband-import.service.js';

@Controller('admin/wristbands/import') @Roles('ADMIN') export class WristbandImportController {
  constructor(private importService: WristbandImportService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: tmpdir() }), limits: { fileSize: 5 * 1024 * 1024 } }))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new DomainError('FILE_REQUIRED', 'An .xlsx or .csv file is required', 400);
    try {
      return file.originalname.toLowerCase().endsWith('.csv') ? await this.importService.fromCsv(file.path) : await this.importService.fromExcel(file.path);
    } finally {
      await unlink(file.path).catch(() => {});
    }
  }
}
