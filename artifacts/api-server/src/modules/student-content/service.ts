import { badRequest, forbidden } from "../../shared/http-error";
import type { AuthenticatedUser } from "../identity/service";
import * as repository from "./repository";

export async function studentSubjectOutline(user: AuthenticatedUser, rawSubject: unknown) {
  if (user.studentId === null) {
    throw forbidden("Сурагчийн бүртгэлгүй байна.", "NO_STUDENT_LINK");
  }
  const subjectCode = typeof rawSubject === "string" ? rawSubject.trim() : "";
  if (!subjectCode || subjectCode.length > 30) {
    throw badRequest("Хичээлийн код буруу байна.");
  }

  const [book] = await repository.subjectBook(user.studentId, subjectCode);
  if (!book) {
    return {
      subjectCode,
      subjectName: "",
      bookTitle: null,
      materialId: null,
      pageOffset: 0,
      totalSections: 0,
      currentPosition: null,
      sections: [],
    };
  }
  const sections = await repository.subjectOutline(user.studentId, subjectCode);
  return {
    subjectCode,
    subjectName: book.subjectName,
    bookTitle: book.bookTitle,
    materialId: book.materialId,
    pageOffset: book.pageOffset,
    totalSections: sections.length,
    currentPosition: sections.find((row) => row.isCurrent)?.position ?? null,
    sections,
  };
}
