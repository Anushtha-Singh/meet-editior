import { useEffect, useState } from "react";
import socket from "../services/socket";

const EMPTY_PRESENTATION = {
  name: "",
  data: "",
  page: 1,
  pageCount: 0,
  strokes: [],
};

function useSharedClassroom() {
  const [teacherCode, setTeacherCode] = useState("");
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
    socket.on("presentation-state", handlePresentationState);
    socket.on("presentation-page-update", handlePageUpdate);
    socket.on("annotation-update", handleAnnotation);
    socket.on("annotations-cleared", handleClearAnnotations);

    return () => {
      socket.off("teacher-code-update", setTeacherCode);
      socket.off("presentation-state", handlePresentationState);
      socket.off("presentation-page-update", handlePageUpdate);
      socket.off("annotation-update", handleAnnotation);
      socket.off("annotations-cleared", handleClearAnnotations);
    };
  }, []);

  return { teacherCode, setTeacherCode, presentation };
}

export default useSharedClassroom;
