import { useEffect, useState } from "react";
import socket from "../services/socket";

const EMPTY_PRESENTATION = {
  name: "",
  data: "",
  page: 1,
  pageCount: 0,
  strokes: [],
};

const DEFAULT_TEACHER_CODE = {
  python: 'print("Follow along!")',
  c: '#include <stdio.h>\n\nint main() {\n  printf("Follow along!\\n");\n  return 0;\n}',
};

function useSharedClassroom() {
  const [teacherCode, setTeacherCode] = useState(DEFAULT_TEACHER_CODE.python);
  const [teacherExecution, setTeacherExecution] = useState({
    status: "idle",
    output: "",
    error: "",
  });
  const [presentation, setPresentation] = useState(EMPTY_PRESENTATION);

  useEffect(() => {
    const handlePresentationState = (nextPresentation) => {
      setPresentation({
        ...EMPTY_PRESENTATION,
        ...nextPresentation,
        strokes: Array.isArray(nextPresentation?.strokes)
          ? nextPresentation.strokes
          : [],
      });
    };
    const handlePageUpdate = ({ page, pageCount }) => {
      setPresentation((current) => ({ ...current, page, pageCount }));
    };
    const handleAnnotation = (stroke) => {
      setPresentation((current) => ({
        ...current,
        strokes: [...current.strokes, stroke],
      }));
    };
    const handleClearAnnotations = ({ page }) => {
      setPresentation((current) => ({
        ...current,
        strokes: current.strokes.filter((stroke) => stroke.page !== page),
      }));
    };

    socket.on("teacher-code-update", setTeacherCode);
    socket.on("teacher-execution-update", setTeacherExecution);
    socket.on("presentation-state", handlePresentationState);
    socket.on("presentation-page-update", handlePageUpdate);
    socket.on("annotation-update", handleAnnotation);
    socket.on("annotations-cleared", handleClearAnnotations);

    return () => {
      socket.off("teacher-code-update", setTeacherCode);
      socket.off("teacher-execution-update", setTeacherExecution);
      socket.off("presentation-state", handlePresentationState);
      socket.off("presentation-page-update", handlePageUpdate);
      socket.off("annotation-update", handleAnnotation);
      socket.off("annotations-cleared", handleClearAnnotations);
    };
  }, []);

  return { teacherCode, setTeacherCode, teacherExecution, presentation };
}

export default useSharedClassroom;
