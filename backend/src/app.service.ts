import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { ReadinessType } from './entities/enums/readiness-type.enum';
import { ReadinessLevel } from './entities/readiness-level.entity';

@Injectable()
export class AppService {
  constructor(private em: EntityManager) {}
  getHello(): string {
    return 'This is the LaunchUp API!';
  }

  async generateReadinessTypes() {
    const entries = [
      { level: 1, name: 'Basic Principle', readinessType: ReadinessType.T },
      {
        level: 2,
        name: 'Technology Concept Formulation',
        readinessType: ReadinessType.T,
      },
      {
        level: 3,
        name: 'Experimental Proof of Concept',
        readinessType: ReadinessType.T,
      },
      {
        level: 4,
        name: 'Technology Validation in Lab',
        readinessType: ReadinessType.T,
      },
      {
        level: 5,
        name: 'Technology Demonstration in Relevant Environment',
        readinessType: ReadinessType.T,
      },
      {
        level: 6,
        name: 'System Prototype Demonstration in Operational Environment',
        readinessType: ReadinessType.T,
      },
      {
        level: 7,
        name: 'System Prototype Demonstration in Operational Environment',
        readinessType: ReadinessType.T,
      },
      {
        level: 8,
        name: 'Actual System Completed and Qualified',
        readinessType: ReadinessType.T,
      },
      {
        level: 9,
        name: 'Actual System Proven Through Successful Mission Operations',
        readinessType: ReadinessType.T,
      },
      {
        level: 1,
        name: 'Market Research Initiated',
        readinessType: ReadinessType.M,
      },
      {
        level: 2,
        name: 'Market Hypothesis Formulated',
        readinessType: ReadinessType.M,
      },
      {
        level: 3,
        name: 'Preliminary Market Strategy Developed',
        readinessType: ReadinessType.M,
      },
      {
        level: 4,
        name: 'Market Strategy Refined and Tested',
        readinessType: ReadinessType.M,
      },
      {
        level: 5,
        name: 'Full Market Strategy and Go-to-Market Plan Developed',
        readinessType: ReadinessType.M,
      },
      {
        level: 6,
        name: 'Market Testing and Validation Completed',
        readinessType: ReadinessType.M,
      },
      {
        level: 7,
        name: 'Market Entry and Initial Sales',
        readinessType: ReadinessType.M,
      },
      {
        level: 8,
        name: 'Market Expansion and Scaling',
        readinessType: ReadinessType.M,
      },
      {
        level: 9,
        name: 'Market Leadership and Continuous Innovation',
        readinessType: ReadinessType.M,
      },
      {
        level: 1,
        name: 'Initial Concept Acceptance',
        readinessType: ReadinessType.A,
      },
      {
        level: 2,
        name: 'Feedback-Driven Concept Refinement',
        readinessType: ReadinessType.A,
      },
      {
        level: 3,
        name: 'Initial Prototype and Stakeholder Interaction',
        readinessType: ReadinessType.A,
      },
      {
        level: 4,
        name: 'Market Testing and Initial Customer Feedback',
        readinessType: ReadinessType.A,
      },
      {
        level: 5,
        name: 'Refinement Based on Market Feedback',
        readinessType: ReadinessType.A,
      },
      {
        level: 6,
        name: 'Widespread Market Engagement and Feedback Analysis',
        readinessType: ReadinessType.A,
      },
      {
        level: 7,
        name: 'Market Penetration and Consumer Advocacy',
        readinessType: ReadinessType.A,
      },
      {
        level: 8,
        name: 'Market Expansion and Sustainability',
        readinessType: ReadinessType.A,
      },
      {
        level: 9,
        name: 'Established Market Leadership and Continuous Innovation',
        readinessType: ReadinessType.A,
      },
      {
        level: 1,
        name: 'Foundational Planning and Structure',
        readinessType: ReadinessType.O,
      },
      {
        level: 2,
        name: 'Initial Capability Building',
        readinessType: ReadinessType.O,
      },
      {
        level: 3,
        name: 'Operational Efficiency and Team Development',
        readinessType: ReadinessType.O,
      },
      {
        level: 4,
        name: 'Strategic Development and Market Alignment',
        readinessType: ReadinessType.O,
      },
      {
        level: 5,
        name: 'Market Readiness and Operational Scaling',
        readinessType: ReadinessType.O,
      },
      {
        level: 6,
        name: 'Advanced Operational Management and Efficiency',
        readinessType: ReadinessType.O,
      },
      {
        level: 7,
        name: 'Comprehensive Market Integration and Growth Strategies',
        readinessType: ReadinessType.O,
      },
      {
        level: 8,
        name: 'Leadership Development and Organizational Culture Strengthening',
        readinessType: ReadinessType.O,
      },
      {
        level: 9,
        name: 'Organizational Maturity and Market Leadership',
        readinessType: ReadinessType.O,
      },
      {
        level: 1,
        name: 'Initial Regulatory Awareness',
        readinessType: ReadinessType.R,
      },
      {
        level: 2,
        name: 'Regulatory Requirements Analysis',
        readinessType: ReadinessType.R,
      },
      {
        level: 3,
        name: 'Initial Compliance and Documentation',
        readinessType: ReadinessType.R,
      },
      {
        level: 4,
        name: 'Comprehensive Compliance and Internal Auditing',
        readinessType: ReadinessType.R,
      },
      {
        level: 5,
        name: 'Regulatory Engagement and External Certification',
        readinessType: ReadinessType.R,
      },
      {
        level: 6,
        name: 'Advanced Regulatory Strategy and Global Compliance',
        readinessType: ReadinessType.R,
      },
      {
        level: 7,
        name: 'Proactive Regulatory Leadership and Innovation',
        readinessType: ReadinessType.R,
      },
      {
        level: 8,
        name: 'Regulatory Compliance Optimization and International Standards',
        readinessType: ReadinessType.R,
      },
      {
        level: 9,
        name: 'Global Regulatory Leadership and Advocacy',
        readinessType: ReadinessType.R,
      },
      {
        level: 1,
        name: 'Initial Investment Conceptualization',
        readinessType: ReadinessType.I,
      },
      {
        level: 2,
        name: 'Investment Planning and Structuring',
        readinessType: ReadinessType.I,
      },
      {
        level: 3,
        name: 'Investor Engagement and Pitching',
        readinessType: ReadinessType.I,
      },
      {
        level: 4,
        name: 'Investment Documentation and Legal Preparedness',
        readinessType: ReadinessType.I,
      },
      {
        level: 5,
        name: 'Investor Outreach and Initial Meetings',
        readinessType: ReadinessType.I,
      },
      {
        level: 6,
        name: 'Investment Negotiations and Deal Structuring',
        readinessType: ReadinessType.I,
      },
      {
        level: 7,
        name: 'Finalizing Investment and Post-Investment Planning',
        readinessType: ReadinessType.I,
      },
      {
        level: 8,
        name: 'Investment Growth and Expansion',
        readinessType: ReadinessType.I,
      },
      {
        level: 9,
        name: 'Investment Maturity and Market Leadership',
        readinessType: ReadinessType.I,
      },
    ];

    for (let i = 0; i < entries.length; i++) {
      const r = new ReadinessLevel();
      r.level = entries[i].level;
      r.name = entries[i].name;
      r.readinessType = entries[i].readinessType;
      await this.em.persistAndFlush(r);
    }
  }
}
