import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

type ObjectiveStatus = {
  id: string;
  title: string;
  summary: string;
  backend: string[];
  frontend: string[];
  tables: string[];
  status: 'implemented' | 'partial';
};

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('design/status')
  getDesignStatus() {
    const objectives: ObjectiveStatus[] = [
      {
        id: '1',
        title: 'Reduce hallucinations with grounded AI',
        summary:
          'The backend now enforces grounded prompt construction, score normalization, and failure logging so generated recommendations stay anchored to verified startup data.',
        backend: ['AiService', 'BaselineService', 'AiMetricsService'],
        frontend: ['Landing hero copy', 'Objectives page'],
        tables: ['ai_bias_audits', 'ai_recommendations', 'rag_contexts'],
        status: 'partial',
      },
      {
        id: '2',
        title: 'Improve readiness classification',
        summary:
          'Readiness scoring is computed in the backend, persisted as a snapshot, and surfaced in a frontend dashboard with a tier label and dimension breakdown.',
        backend: ['ReadinessService', 'ReadinessController'],
        frontend: ['Readiness dashboard'],
        tables: ['readiness_evaluations', 'readiness_gaps'],
        status: 'implemented',
      },
      {
        id: '3',
        title: 'Support multimodal document intake',
        summary:
          'The OCR module accepts image paths or buffers and routes them through Tesseract when available, with a fallback path that keeps the app running when OCR tooling is missing.',
        backend: ['OcrService', 'OcrController'],
        frontend: ['Objectives page', 'Upload flow entry points'],
        tables: ['ocr_documents'],
        status: 'partial',
      },
      {
        id: '4',
        title: 'Correct leniency bias in scoring',
        summary:
          'Bias normalization is backed by a stored baseline and the readiness evaluation flow now records score snapshots and gaps for later audit.',
        backend: ['BaselineService', 'ReadinessService'],
        frontend: ['Objectives page', 'Readiness dashboard'],
        tables: ['ai_bias_audits', 'readiness_evaluations'],
        status: 'partial',
      },
    ];

    return {
      project: 'LaunchUp Enhanced',
      neonDbReady: true,
      objectives,
    };
  }
  // @Post('/a')
  // generateUratQuestions() {
  //  this.appService.generateUratQuestions();
  // }
  //
  // @Post('/b')
  // generateCalculatorQuestions() {
  //  this.appService.generateCalculatorQuestions();
  // }
  //
  // @Post('/c')
  // generateReadinessTypes() {
  //  this.appService.generateReadinessTypes();
  // }
}
