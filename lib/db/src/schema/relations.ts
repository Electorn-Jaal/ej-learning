import { relations } from "drizzle-orm/relations";
import { subjectsInCore, sourceMaterialsInContent, sourceOutlineNodesInContent, contentNodesInContent, gradeLevelsInCore, contentSourceAlignmentsInContent, skillsInContent, sourceVersionsInContent, contentSkillMapsInContent, skillDependenciesInContent, tasksInLearning, importJobsInStaging, changeLogsInAudit, importRowsInStaging, classesInCore, diagnosticItemsInAssessment, studentsInCore, diagnosticAttemptsInAssessment, masteryChecksInLearning, dailyLessonsInLearning, webDiagnosticSubmissionsInAssessment, sourceMaterialGradesInContent, studentEnrollmentsInCore, diagnosticResponsesInAssessment, webDiagnosticAnswersInAssessment, studentSkillMasteryInLearning } from "./database";

export const sourceMaterialsInContentRelations = relations(sourceMaterialsInContent, ({one, many}) => ({
	subjectsInCore: one(subjectsInCore, {
		fields: [sourceMaterialsInContent.subjectId],
		references: [subjectsInCore.id]
	}),
	sourceOutlineNodesInContents: many(sourceOutlineNodesInContent),
	contentSourceAlignmentsInContents: many(contentSourceAlignmentsInContent),
	sourceVersionsInContents: many(sourceVersionsInContent),
	skillDependenciesInContents: many(skillDependenciesInContent),
	tasksInLearnings: many(tasksInLearning),
	diagnosticAttemptsInAssessments: many(diagnosticAttemptsInAssessment),
	masteryChecksInLearnings: many(masteryChecksInLearning),
	dailyLessonsInLearnings: many(dailyLessonsInLearning),
	sourceMaterialGradesInContents: many(sourceMaterialGradesInContent),
}));

export const subjectsInCoreRelations = relations(subjectsInCore, ({many}) => ({
	sourceMaterialsInContents: many(sourceMaterialsInContent),
	contentNodesInContents: many(contentNodesInContent),
	skillsInContents: many(skillsInContent),
	diagnosticItemsInAssessments: many(diagnosticItemsInAssessment),
	diagnosticAttemptsInAssessments: many(diagnosticAttemptsInAssessment),
	webDiagnosticSubmissionsInAssessments: many(webDiagnosticSubmissionsInAssessment),
}));

export const sourceOutlineNodesInContentRelations = relations(sourceOutlineNodesInContent, ({one, many}) => ({
	sourceMaterialsInContent: one(sourceMaterialsInContent, {
		fields: [sourceOutlineNodesInContent.sourceMaterialId],
		references: [sourceMaterialsInContent.id]
	}),
	sourceOutlineNodesInContent: one(sourceOutlineNodesInContent, {
		fields: [sourceOutlineNodesInContent.parentId],
		references: [sourceOutlineNodesInContent.id],
		relationName: "sourceOutlineNodesInContent_parentId_sourceOutlineNodesInContent_id"
	}),
	sourceOutlineNodesInContents: many(sourceOutlineNodesInContent, {
		relationName: "sourceOutlineNodesInContent_parentId_sourceOutlineNodesInContent_id"
	}),
	contentSourceAlignmentsInContents: many(contentSourceAlignmentsInContent),
}));

export const contentNodesInContentRelations = relations(contentNodesInContent, ({one, many}) => ({
	subjectsInCore: one(subjectsInCore, {
		fields: [contentNodesInContent.subjectId],
		references: [subjectsInCore.id]
	}),
	contentNodesInContent: one(contentNodesInContent, {
		fields: [contentNodesInContent.parentId],
		references: [contentNodesInContent.id],
		relationName: "contentNodesInContent_parentId_contentNodesInContent_id"
	}),
	contentNodesInContents: many(contentNodesInContent, {
		relationName: "contentNodesInContent_parentId_contentNodesInContent_id"
	}),
	gradeLevelsInCore_gradeFromId: one(gradeLevelsInCore, {
		fields: [contentNodesInContent.gradeFromId],
		references: [gradeLevelsInCore.id],
		relationName: "contentNodesInContent_gradeFromId_gradeLevelsInCore_id"
	}),
	gradeLevelsInCore_gradeToId: one(gradeLevelsInCore, {
		fields: [contentNodesInContent.gradeToId],
		references: [gradeLevelsInCore.id],
		relationName: "contentNodesInContent_gradeToId_gradeLevelsInCore_id"
	}),
	contentSourceAlignmentsInContents: many(contentSourceAlignmentsInContent),
	contentSkillMapsInContents: many(contentSkillMapsInContent),
}));

export const gradeLevelsInCoreRelations = relations(gradeLevelsInCore, ({many}) => ({
	contentNodesInContents_gradeFromId: many(contentNodesInContent, {
		relationName: "contentNodesInContent_gradeFromId_gradeLevelsInCore_id"
	}),
	contentNodesInContents_gradeToId: many(contentNodesInContent, {
		relationName: "contentNodesInContent_gradeToId_gradeLevelsInCore_id"
	}),
	skillsInContents: many(skillsInContent),
	classesInCores: many(classesInCore),
	diagnosticItemsInAssessments: many(diagnosticItemsInAssessment),
	diagnosticAttemptsInAssessments: many(diagnosticAttemptsInAssessment),
	webDiagnosticSubmissionsInAssessments: many(webDiagnosticSubmissionsInAssessment),
	sourceMaterialGradesInContents: many(sourceMaterialGradesInContent),
}));

export const contentSourceAlignmentsInContentRelations = relations(contentSourceAlignmentsInContent, ({one}) => ({
	contentNodesInContent: one(contentNodesInContent, {
		fields: [contentSourceAlignmentsInContent.contentNodeId],
		references: [contentNodesInContent.id]
	}),
	sourceMaterialsInContent: one(sourceMaterialsInContent, {
		fields: [contentSourceAlignmentsInContent.sourceMaterialId],
		references: [sourceMaterialsInContent.id]
	}),
	sourceOutlineNodesInContent: one(sourceOutlineNodesInContent, {
		fields: [contentSourceAlignmentsInContent.sourceOutlineNodeId],
		references: [sourceOutlineNodesInContent.id]
	}),
}));

export const skillsInContentRelations = relations(skillsInContent, ({one, many}) => ({
	subjectsInCore: one(subjectsInCore, {
		fields: [skillsInContent.subjectId],
		references: [subjectsInCore.id]
	}),
	gradeLevelsInCore: one(gradeLevelsInCore, {
		fields: [skillsInContent.gradeLevelId],
		references: [gradeLevelsInCore.id]
	}),
	contentSkillMapsInContents: many(contentSkillMapsInContent),
	skillDependenciesInContents_skillId: many(skillDependenciesInContent, {
		relationName: "skillDependenciesInContent_skillId_skillsInContent_id"
	}),
	skillDependenciesInContents_prerequisiteSkillId: many(skillDependenciesInContent, {
		relationName: "skillDependenciesInContent_prerequisiteSkillId_skillsInContent_id"
	}),
	tasksInLearnings_skillId: many(tasksInLearning, {
		relationName: "tasksInLearning_skillId_skillsInContent_id"
	}),
	tasksInLearnings_prerequisiteSkillId: many(tasksInLearning, {
		relationName: "tasksInLearning_prerequisiteSkillId_skillsInContent_id"
	}),
	diagnosticItemsInAssessments: many(diagnosticItemsInAssessment),
	masteryChecksInLearnings: many(masteryChecksInLearning),
	dailyLessonsInLearnings_coreSkillId: many(dailyLessonsInLearning, {
		relationName: "dailyLessonsInLearning_coreSkillId_skillsInContent_id"
	}),
	dailyLessonsInLearnings_recoverySkillId: many(dailyLessonsInLearning, {
		relationName: "dailyLessonsInLearning_recoverySkillId_skillsInContent_id"
	}),
	studentSkillMasteryInLearnings: many(studentSkillMasteryInLearning),
}));

export const sourceVersionsInContentRelations = relations(sourceVersionsInContent, ({one}) => ({
	sourceMaterialsInContent: one(sourceMaterialsInContent, {
		fields: [sourceVersionsInContent.sourceMaterialId],
		references: [sourceMaterialsInContent.id]
	}),
}));

export const contentSkillMapsInContentRelations = relations(contentSkillMapsInContent, ({one}) => ({
	contentNodesInContent: one(contentNodesInContent, {
		fields: [contentSkillMapsInContent.contentNodeId],
		references: [contentNodesInContent.id]
	}),
	skillsInContent: one(skillsInContent, {
		fields: [contentSkillMapsInContent.skillId],
		references: [skillsInContent.id]
	}),
}));

export const skillDependenciesInContentRelations = relations(skillDependenciesInContent, ({one}) => ({
	skillsInContent_skillId: one(skillsInContent, {
		fields: [skillDependenciesInContent.skillId],
		references: [skillsInContent.id],
		relationName: "skillDependenciesInContent_skillId_skillsInContent_id"
	}),
	skillsInContent_prerequisiteSkillId: one(skillsInContent, {
		fields: [skillDependenciesInContent.prerequisiteSkillId],
		references: [skillsInContent.id],
		relationName: "skillDependenciesInContent_prerequisiteSkillId_skillsInContent_id"
	}),
	sourceMaterialsInContent: one(sourceMaterialsInContent, {
		fields: [skillDependenciesInContent.evidenceSourceMaterialId],
		references: [sourceMaterialsInContent.id]
	}),
}));

export const tasksInLearningRelations = relations(tasksInLearning, ({one}) => ({
	skillsInContent_skillId: one(skillsInContent, {
		fields: [tasksInLearning.skillId],
		references: [skillsInContent.id],
		relationName: "tasksInLearning_skillId_skillsInContent_id"
	}),
	skillsInContent_prerequisiteSkillId: one(skillsInContent, {
		fields: [tasksInLearning.prerequisiteSkillId],
		references: [skillsInContent.id],
		relationName: "tasksInLearning_prerequisiteSkillId_skillsInContent_id"
	}),
	sourceMaterialsInContent: one(sourceMaterialsInContent, {
		fields: [tasksInLearning.sourceMaterialId],
		references: [sourceMaterialsInContent.id]
	}),
}));

export const changeLogsInAuditRelations = relations(changeLogsInAudit, ({one}) => ({
	importJobsInStaging: one(importJobsInStaging, {
		fields: [changeLogsInAudit.importJobId],
		references: [importJobsInStaging.id]
	}),
}));

export const importJobsInStagingRelations = relations(importJobsInStaging, ({many}) => ({
	changeLogsInAudits: many(changeLogsInAudit),
	importRowsInStagings: many(importRowsInStaging),
}));

export const importRowsInStagingRelations = relations(importRowsInStaging, ({one}) => ({
	importJobsInStaging: one(importJobsInStaging, {
		fields: [importRowsInStaging.importJobId],
		references: [importJobsInStaging.id]
	}),
}));

export const classesInCoreRelations = relations(classesInCore, ({one, many}) => ({
	gradeLevelsInCore: one(gradeLevelsInCore, {
		fields: [classesInCore.gradeLevelId],
		references: [gradeLevelsInCore.id]
	}),
	studentEnrollmentsInCores: many(studentEnrollmentsInCore),
}));

export const diagnosticItemsInAssessmentRelations = relations(diagnosticItemsInAssessment, ({one, many}) => ({
	subjectsInCore: one(subjectsInCore, {
		fields: [diagnosticItemsInAssessment.subjectId],
		references: [subjectsInCore.id]
	}),
	gradeLevelsInCore: one(gradeLevelsInCore, {
		fields: [diagnosticItemsInAssessment.gradeLevelId],
		references: [gradeLevelsInCore.id]
	}),
	skillsInContent: one(skillsInContent, {
		fields: [diagnosticItemsInAssessment.skillId],
		references: [skillsInContent.id]
	}),
	diagnosticResponsesInAssessments: many(diagnosticResponsesInAssessment),
	webDiagnosticAnswersInAssessments: many(webDiagnosticAnswersInAssessment),
}));

export const diagnosticAttemptsInAssessmentRelations = relations(diagnosticAttemptsInAssessment, ({one, many}) => ({
	studentsInCore: one(studentsInCore, {
		fields: [diagnosticAttemptsInAssessment.studentId],
		references: [studentsInCore.id]
	}),
	subjectsInCore: one(subjectsInCore, {
		fields: [diagnosticAttemptsInAssessment.subjectId],
		references: [subjectsInCore.id]
	}),
	gradeLevelsInCore: one(gradeLevelsInCore, {
		fields: [diagnosticAttemptsInAssessment.gradeLevelId],
		references: [gradeLevelsInCore.id]
	}),
	sourceMaterialsInContent: one(sourceMaterialsInContent, {
		fields: [diagnosticAttemptsInAssessment.sourceMaterialId],
		references: [sourceMaterialsInContent.id]
	}),
	diagnosticResponsesInAssessments: many(diagnosticResponsesInAssessment),
}));

export const studentsInCoreRelations = relations(studentsInCore, ({many}) => ({
	diagnosticAttemptsInAssessments: many(diagnosticAttemptsInAssessment),
	webDiagnosticSubmissionsInAssessments: many(webDiagnosticSubmissionsInAssessment),
	studentEnrollmentsInCores: many(studentEnrollmentsInCore),
	studentSkillMasteryInLearnings: many(studentSkillMasteryInLearning),
}));

export const masteryChecksInLearningRelations = relations(masteryChecksInLearning, ({one}) => ({
	skillsInContent: one(skillsInContent, {
		fields: [masteryChecksInLearning.skillId],
		references: [skillsInContent.id]
	}),
	sourceMaterialsInContent: one(sourceMaterialsInContent, {
		fields: [masteryChecksInLearning.sourceMaterialId],
		references: [sourceMaterialsInContent.id]
	}),
}));

export const dailyLessonsInLearningRelations = relations(dailyLessonsInLearning, ({one}) => ({
	skillsInContent_coreSkillId: one(skillsInContent, {
		fields: [dailyLessonsInLearning.coreSkillId],
		references: [skillsInContent.id],
		relationName: "dailyLessonsInLearning_coreSkillId_skillsInContent_id"
	}),
	skillsInContent_recoverySkillId: one(skillsInContent, {
		fields: [dailyLessonsInLearning.recoverySkillId],
		references: [skillsInContent.id],
		relationName: "dailyLessonsInLearning_recoverySkillId_skillsInContent_id"
	}),
	sourceMaterialsInContent: one(sourceMaterialsInContent, {
		fields: [dailyLessonsInLearning.sourceMaterialId],
		references: [sourceMaterialsInContent.id]
	}),
}));

export const webDiagnosticSubmissionsInAssessmentRelations = relations(webDiagnosticSubmissionsInAssessment, ({one, many}) => ({
	studentsInCore: one(studentsInCore, {
		fields: [webDiagnosticSubmissionsInAssessment.studentId],
		references: [studentsInCore.id]
	}),
	subjectsInCore: one(subjectsInCore, {
		fields: [webDiagnosticSubmissionsInAssessment.subjectId],
		references: [subjectsInCore.id]
	}),
	gradeLevelsInCore: one(gradeLevelsInCore, {
		fields: [webDiagnosticSubmissionsInAssessment.gradeLevelId],
		references: [gradeLevelsInCore.id]
	}),
	webDiagnosticAnswersInAssessments: many(webDiagnosticAnswersInAssessment),
}));

export const sourceMaterialGradesInContentRelations = relations(sourceMaterialGradesInContent, ({one}) => ({
	sourceMaterialsInContent: one(sourceMaterialsInContent, {
		fields: [sourceMaterialGradesInContent.sourceMaterialId],
		references: [sourceMaterialsInContent.id]
	}),
	gradeLevelsInCore: one(gradeLevelsInCore, {
		fields: [sourceMaterialGradesInContent.gradeLevelId],
		references: [gradeLevelsInCore.id]
	}),
}));

export const studentEnrollmentsInCoreRelations = relations(studentEnrollmentsInCore, ({one}) => ({
	studentsInCore: one(studentsInCore, {
		fields: [studentEnrollmentsInCore.studentId],
		references: [studentsInCore.id]
	}),
	classesInCore: one(classesInCore, {
		fields: [studentEnrollmentsInCore.classId],
		references: [classesInCore.id]
	}),
}));

export const diagnosticResponsesInAssessmentRelations = relations(diagnosticResponsesInAssessment, ({one}) => ({
	diagnosticAttemptsInAssessment: one(diagnosticAttemptsInAssessment, {
		fields: [diagnosticResponsesInAssessment.attemptId],
		references: [diagnosticAttemptsInAssessment.id]
	}),
	diagnosticItemsInAssessment: one(diagnosticItemsInAssessment, {
		fields: [diagnosticResponsesInAssessment.diagnosticItemId],
		references: [diagnosticItemsInAssessment.id]
	}),
}));

export const webDiagnosticAnswersInAssessmentRelations = relations(webDiagnosticAnswersInAssessment, ({one}) => ({
	webDiagnosticSubmissionsInAssessment: one(webDiagnosticSubmissionsInAssessment, {
		fields: [webDiagnosticAnswersInAssessment.submissionId],
		references: [webDiagnosticSubmissionsInAssessment.id]
	}),
	diagnosticItemsInAssessment: one(diagnosticItemsInAssessment, {
		fields: [webDiagnosticAnswersInAssessment.diagnosticItemId],
		references: [diagnosticItemsInAssessment.id]
	}),
}));

export const studentSkillMasteryInLearningRelations = relations(studentSkillMasteryInLearning, ({one}) => ({
	studentsInCore: one(studentsInCore, {
		fields: [studentSkillMasteryInLearning.studentId],
		references: [studentsInCore.id]
	}),
	skillsInContent: one(skillsInContent, {
		fields: [studentSkillMasteryInLearning.skillId],
		references: [skillsInContent.id]
	}),
}));