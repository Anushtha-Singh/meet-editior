import StudentPage from "./pages/StudentPage";
import TeacherPage from "./pages/TeacherPage";

function App() {
  const isTeacher = new URLSearchParams(window.location.search).has("teacher");

  return isTeacher ? <TeacherPage /> : <StudentPage />;
}

export default App;
