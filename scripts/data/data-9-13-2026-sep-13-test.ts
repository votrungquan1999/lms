/**
 * Sep 13 Test — 30 questions, Python-or-C++ (bilingual EN/VN).
 *
 * Third test in the series (after Sep 6). Scope is ONLY what students have been taught:
 * earlier fundamentals + "Files, Sorting & Records" sections 0–6 — reading a file,
 * sort(), writing out.txt, highest-first via a named function (key= / comparison
 * function), reading name + score into two lists. Nothing from section 7 on
 * (no tuple / pair, no sorting names with scores), no reverse / rbegin, no lambdas.
 *
 * Structure:
 *   Part A — 20 hard concept MC (single_select, weight 2), misconception-targeted,
 *            Python + C++ snippets give the SAME answer; bilingual explanation
 *            revealed after release. Correct option position varies.
 *   Part B — 10 file input/output programs, the same read → (process) → write
 *            pattern every time: B1–B7 easy (weight 4), B8–B10 medium (weight 6).
 * Grade split: MC 40 / coding 46, same as Sep 6. Graded, untimed, exam-safe flags.
 * referenceAnswer carries a Python AND a C++ solution (teacher/AI-grader facing).
 *
 * Seed: bun scripts/create-test.ts scripts/data/data-9-13-2026-sep-13-test.ts
 */
export default {
  courseId: "c98f8f96-916d-48e0-a67b-a161c2cf422c",
  test: {
    title: "Sep 13 Test",
    description:
      "Files & sorting. Part B: use Python or C++; read the given file, write to the given file.\n*Tệp & sắp xếp. Phần B: dùng Python hoặc C++; đọc tệp đã cho, ghi vào tệp đã cho.*",
    showCorrectAnswerAfterSubmit: false,
    showGradeAfterSubmit: false,
  },
  questions: [
    // ==================== PART A — CONCEPT MC (weight 2 each) ====================

    // --- Files and folders ---
    {
      type: "single_select",
      title: "A1. The file is in another folder",
      content:
        'Your program opens `"scores.txt"` (Python: `open("scores.txt")`, C++: `ifstream fin("scores.txt")`), but `scores.txt` is saved in a DIFFERENT folder from the program. What happens?\n*Chương trình mở `"scores.txt"` (Python: `open("scores.txt")`, C++: `ifstream fin("scores.txt")`), nhưng `scores.txt` nằm ở thư mục KHÁC với chương trình. Chuyện gì xảy ra?*',
      options: [
        {
          text: "The program searches the whole computer until it finds scores.txt / Chương trình tìm khắp máy tính cho tới khi thấy scores.txt",
          isCorrect: false,
        },
        {
          text: "The program cannot find the file — it only looks in its own folder, so no scores are read / Chương trình không tìm thấy tệp — nó chỉ tìm trong thư mục của chính nó, nên không đọc được điểm nào",
          isCorrect: true,
        },
        {
          text: "It works, as long as the file name is spelled correctly / Vẫn chạy đúng, miễn là tên tệp viết đúng",
          isCorrect: false,
        },
        {
          text: "The program creates a new scores.txt full of scores / Chương trình tạo một scores.txt mới đầy điểm",
          isCorrect: false,
        },
      ],
      explanation:
        '`"scores.txt"` is only a NAME, not a location, so the program looks for that name in its own folder and nowhere else. Python stops with an error saying the file does not exist. C++ does not complain at all — the reading loop simply runs zero times, so you get an empty answer with no warning. Either way the fix is the same: the data file must be in the same folder as the program.\n*`"scores.txt"` chỉ là một cái TÊN, không phải vị trí, nên chương trình tìm tên đó trong thư mục của nó và không tìm ở đâu khác. Python dừng với lỗi báo tệp không tồn tại. C++ thì không báo gì — vòng lặp đọc chỉ chạy 0 lần, nên bạn nhận kết quả rỗng mà không có cảnh báo. Dù thế nào, cách sửa như nhau: tệp dữ liệu phải nằm cùng thư mục với chương trình.*',
      weight: 2,
    },
    {
      type: "single_select",
      title: "A2. No print, no cout",
      content:
        "A program reads `scores.txt`, sorts the scores, and writes them into `out.txt`. It has no `print` (C++: no `cout`). When it runs correctly, what appears on the screen?\n*Một chương trình đọc `scores.txt`, sắp xếp điểm, rồi ghi vào `out.txt`. Nó không có `print` (C++: không có `cout`). Khi chạy đúng, màn hình hiện gì?*",
      options: [
        {
          text: "Nothing — the answer is only inside out.txt / Không gì cả — kết quả chỉ nằm trong out.txt",
          isCorrect: true,
        },
        {
          text: "The sorted scores, because writing a file also shows it on the screen / Các điểm đã sắp xếp, vì ghi tệp cũng hiện ra màn hình",
          isCorrect: false,
        },
        {
          text: "The scores in their original order from scores.txt / Các điểm theo thứ tự gốc trong scores.txt",
          isCorrect: false,
        },
        {
          text: "An error, because every program must print something / Một lỗi, vì chương trình nào cũng phải in ra gì đó",
          isCorrect: false,
        },
      ],
      explanation:
        "Writing to a file sends the answer to out.txt INSTEAD of the screen, and reading a file shows nothing either. So a correct program shows a completely empty screen — to see the answer you open out.txt. An empty screen is not an error; the file is where you check.\n*Ghi vào tệp nghĩa là gửi kết quả vào out.txt THAY VÌ ra màn hình, và đọc tệp cũng không hiện gì. Vì vậy chương trình đúng sẽ để màn hình trống hoàn toàn — muốn xem kết quả thì mở out.txt. Màn hình trống không phải là lỗi; tệp mới là nơi để kiểm tra.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A3. Is the answer right?",
      content:
        "Your program runs on a 100-line file with no errors and writes 100 lines into `out.txt`. What is the BEST way to find out whether the answer is correct?\n*Chương trình chạy với tệp 100 dòng, không lỗi, và ghi 100 dòng vào `out.txt`. Cách TỐT NHẤT để biết kết quả có đúng không là gì?*",
      options: [
        {
          text: "Nothing to check — no error means the answer is correct / Không cần kiểm tra — không lỗi nghĩa là kết quả đúng",
          isCorrect: false,
        },
        {
          text: "Check that out.txt has exactly 100 lines / Kiểm tra out.txt có đúng 100 dòng",
          isCorrect: false,
        },
        {
          text: "Run it on a tiny file (about 5 lines) whose answer you can work out by hand, and compare every line / Chạy với một tệp rất nhỏ (khoảng 5 dòng) mà bạn tự tính được đáp án, rồi so từng dòng",
          isCorrect: true,
        },
        {
          text: "Run it a second time and check that out.txt comes out the same / Chạy lần hai và kiểm tra out.txt ra giống lần đầu",
          isCorrect: false,
        },
      ],
      explanation:
        "A wrong answer never shows an error message — a program can run perfectly and still be wrong. 100 lines only proves the program wrote SOMETHING for everyone; running twice only proves it is wrong the same way twice. A tiny input is the one you can check line by line yourself: shrink the input until you can check the answer by hand.\n*Kết quả sai không bao giờ hiện thông báo lỗi — chương trình có thể chạy trơn tru mà vẫn sai. Đủ 100 dòng chỉ chứng minh chương trình đã ghi GÌ ĐÓ cho mọi người; chạy hai lần chỉ chứng minh nó sai giống nhau hai lần. Đầu vào rất nhỏ mới là thứ bạn tự kiểm tra từng dòng được: thu nhỏ đầu vào tới khi tự kiểm tra bằng tay được.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A4. When does the reading stop?",
      content: `\`scores.txt\` has 100 scores, and the number 100 is NOT written anywhere in the file. How does this loop know when to stop?
*\`scores.txt\` có 100 điểm, và con số 100 KHÔNG được ghi ở đâu trong tệp. Làm sao vòng lặp này biết khi nào dừng?*

Python:
\`\`\`
with open("scores.txt") as f:
    for line in f:
        scores.append(int(line))
\`\`\`
C++:
\`\`\`
int s;
while (fin >> s) {
    scores.push_back(s);
}
\`\`\``,
      options: [
        {
          text: "It cannot know — the first line of the file must say how many scores there are / Không thể biết — dòng đầu của tệp phải ghi có bao nhiêu điểm",
          isCorrect: false,
        },
        {
          text: "It stops when it reads a score of 0 / Nó dừng khi đọc được điểm 0",
          isCorrect: false,
        },
        {
          text: "It never stops by itself — you have to stop the program / Nó không tự dừng — bạn phải tự dừng chương trình",
          isCorrect: false,
        },
        {
          text: "It stops by itself when there is nothing left to read / Nó tự dừng khi tệp không còn gì để đọc",
          isCorrect: true,
        },
      ],
      explanation:
        "Python: `for line in f` hands over one line per pass until the file runs out. C++: `fin >> s` is true while it manages to read a number and false once nothing is left, which ends the while. That is why the SAME program works on a 5-line file and a 100-line file without any change — you never need to know or type the count.\n*Python: `for line in f` đưa từng dòng một mỗi lượt cho tới khi hết tệp. C++: `fin >> s` đúng khi còn đọc được một số và sai khi không còn gì, làm vòng while kết thúc. Vì vậy CÙNG một chương trình chạy được với tệp 5 dòng lẫn tệp 100 dòng mà không sửa gì — bạn không bao giờ cần biết hay gõ số lượng.*",
      weight: 2,
    },

    // --- Reading a file ---
    {
      type: "single_select",
      title: "A5. Counting from a file",
      content: `\`nums.txt\` has 5 lines: 5, 8, 2, 6, 5 (one number per line). What does this print?
*\`nums.txt\` có 5 dòng: 5, 8, 2, 6, 5 (mỗi dòng một số). Đoạn này in ra gì?*

Python:
\`\`\`
count = 0
with open("nums.txt") as f:
    for line in f:
        if int(line) > 5:
            count = count + 1
print(count)
\`\`\`
C++:
\`\`\`
ifstream fin("nums.txt");
int count = 0;
int x;
while (fin >> x) {
    if (x > 5) {
        count = count + 1;
    }
}
cout << count << endl;
\`\`\``,
      options: [
        { text: "4", isCorrect: false },
        { text: "2", isCorrect: true },
        { text: "5", isCorrect: false },
        { text: "3", isCorrect: false },
      ],
      explanation:
        "Only 8 and 6 are BIGGER than 5. The two 5s are equal to 5, not bigger, so `> 5` skips them. Getting 4 means you read it as `>= 5`. The loop reads every line once; the if decides which ones count.\n*Chỉ 8 và 6 LỚN HƠN 5. Hai số 5 bằng 5, không lớn hơn, nên `> 5` bỏ qua chúng. Ra 4 nghĩa là bạn đọc thành `>= 5`. Vòng lặp đọc mỗi dòng một lần; câu if quyết định số nào được đếm.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A6. How many passes?",
      content: `\`students.txt\` has 3 lines: \`An 87\`, \`Binh 92\`, \`Chi 78\`. How many times does the loop body run?
*\`students.txt\` có 3 dòng: \`An 87\`, \`Binh 92\`, \`Chi 78\`. Thân vòng lặp chạy bao nhiêu lần?*

Python:
\`\`\`
count = 0
with open("students.txt") as f:
    for line in f:
        name, score = line.split()
        count = count + 1
print(count)
\`\`\`
C++:
\`\`\`
ifstream fin("students.txt");
string name;
int score;
int count = 0;
while (fin >> name >> score) {
    count = count + 1;
}
cout << count << endl;
\`\`\``,
      options: [
        { text: "6", isCorrect: false },
        { text: "2", isCorrect: false },
        { text: "1", isCorrect: false },
        { text: "3", isCorrect: true },
      ],
      explanation:
        "One pass handles one whole STUDENT — a name AND a score together. Python: `for line in f` gives one line per pass, and `split()` cuts that line into two pieces inside the same pass. C++: `fin >> name >> score` reads two values in one pass. 6 counts the values, not the passes.\n*Mỗi lượt xử lý trọn một HỌC SINH — cả tên VÀ điểm. Python: `for line in f` cho một dòng mỗi lượt, và `split()` cắt dòng đó thành hai phần ngay trong lượt đó. C++: `fin >> name >> score` đọc hai giá trị trong một lượt. 6 là đếm số giá trị, không phải số lượt.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A7. One student short",
      content: `\`students.txt\` has 4 lines: \`An 87\`, \`Binh 92\`, \`Chi 78\`, \`Dung 65\`. They were read into \`names\` and \`scores\` in file order. What does out.txt contain?
*\`students.txt\` có 4 dòng: \`An 87\`, \`Binh 92\`, \`Chi 78\`, \`Dung 65\`. Chúng đã được đọc vào \`names\` và \`scores\` theo thứ tự trong tệp. out.txt chứa gì?*

Python:
\`\`\`
with open("out.txt", "w") as f:
    for i in range(len(names) - 1):
        f.write(names[i] + " " + str(scores[i]) + "\\n")
\`\`\`
C++:
\`\`\`
ofstream fout("out.txt");
for (int i = 0; i < names.size() - 1; i++) {
    fout << names[i] << " " << scores[i] << endl;
}
\`\`\``,
      options: [
        {
          text: "3 lines — An, Binh, Chi. Dung is missing / 3 dòng — An, Binh, Chi. Thiếu Dung",
          isCorrect: true,
        },
        {
          text: "All 4 students / Cả 4 học sinh",
          isCorrect: false,
        },
        {
          text: "3 lines — Binh, Chi, Dung. An is missing / 3 dòng — Binh, Chi, Dung. Thiếu An",
          isCorrect: false,
        },
        {
          text: "Error: index out of range / Lỗi: chỉ số ngoài phạm vi",
          isCorrect: false,
        },
      ],
      explanation:
        "There are 4 students, so `length - 1` is 3 and i runs 0, 1, 2 — index 3 (Dung, the LAST student) is never written. `length - 1` is the index of the last item, but as a loop LIMIT it stops one item too early. To write everyone, loop up to the length itself.\n*Có 4 học sinh, nên `length - 1` là 3 và i chạy 0, 1, 2 — chỉ số 3 (Dung, học sinh CUỐI) không bao giờ được ghi. `length - 1` là chỉ số của phần tử cuối, nhưng dùng làm GIỚI HẠN vòng lặp thì dừng sớm một phần tử. Muốn ghi hết, cho vòng lặp chạy tới đúng độ dài.*",
      weight: 2,
    },

    // --- Writing a file ---
    {
      type: "single_select",
      title: "A8. The missing new line",
      content: `\`scores\` holds 3, 7, 9. What does out.txt contain?
*\`scores\` chứa 3, 7, 9. out.txt chứa gì?*

Python:
\`\`\`
with open("out.txt", "w") as f:
    for s in scores:
        f.write(str(s))
\`\`\`
C++:
\`\`\`
ofstream fout("out.txt");
for (int x : scores) {
    fout << x;
}
\`\`\``,
      options: [
        {
          text: "3, 7 and 9, each on its own line / 3, 7 và 9, mỗi số một dòng",
          isCorrect: false,
        },
        {
          text: "3 7 9 on one line, with spaces / 3 7 9 trên một dòng, có dấu cách",
          isCorrect: false,
        },
        {
          text: "379 on one line / 379 trên một dòng",
          isCorrect: true,
        },
        {
          text: "Only 9 / Chỉ có 9",
          isCorrect: false,
        },
      ],
      explanation:
        'Writing to a file puts down EXACTLY what you give it — nothing extra. No `"\\n"` (C++: no `endl`) means no new line and no space, so the digits stick together as 379. That looks like one big number, which is why a missing new line is so hard to notice.\n*Ghi vào tệp chỉ ghi ĐÚNG những gì bạn đưa — không thêm gì. Không có `"\\n"` (C++: không có `endl`) nghĩa là không xuống dòng, không dấu cách, nên các chữ số dính lại thành 379. Trông như một số lớn, vì vậy thiếu xuống dòng rất khó phát hiện.*',
      weight: 2,
    },
    {
      type: "single_select",
      title: "A9. Opened the wrong way",
      content: `\`out.txt\` is already in the folder from an earlier run. What happens when this runs?
*\`out.txt\` đã có sẵn trong thư mục từ lần chạy trước. Chuyện gì xảy ra khi chạy đoạn này?*

Python:
\`\`\`
with open("out.txt") as f:
    f.write("95\\n")
\`\`\`
C++:
\`\`\`
ifstream fout("out.txt");
fout << 95 << endl;
\`\`\``,
      options: [
        {
          text: "out.txt contains 95 / out.txt chứa 95",
          isCorrect: false,
        },
        {
          text: "95 appears on the screen instead / 95 hiện ra màn hình",
          isCorrect: false,
        },
        {
          text: "out.txt is created but stays empty / out.txt được tạo nhưng trống",
          isCorrect: false,
        },
        {
          text: "Error — the file was opened for READING, so it cannot be written / Lỗi — tệp được mở để ĐỌC, nên không ghi được",
          isCorrect: true,
        },
      ],
      explanation:
        'Python: without `"w"`, `open()` only reads, so `write` fails. C++: `ifstream` is the READING one (i = input); writing needs `ofstream` (o = output), so g++ refuses to compile. The variable name `fout` changes nothing — it is just a name you picked; how the file was OPENED decides what you can do with it.\n*Python: không có `"w"` thì `open()` chỉ đọc, nên `write` bị lỗi. C++: `ifstream` là loại để ĐỌC (i = input); muốn ghi phải dùng `ofstream` (o = output), nên g++ không biên dịch. Tên biến `fout` không thay đổi gì — đó chỉ là tên bạn tự đặt; cách MỞ tệp mới quyết định bạn làm được gì với nó.*',
      weight: 2,
    },
    {
      type: "single_select",
      title: "A10. Sorting too late",
      content: `\`scores.txt\` has 30, 20, 10, 40 (one per line). What does out.txt contain? (Options list the lines of out.txt, separated by commas.)
*\`scores.txt\` có 30, 20, 10, 40 (mỗi dòng một số). out.txt chứa gì? (Các đáp án liệt kê các dòng của out.txt, cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
scores = []

with open("scores.txt") as f:
    for line in f:
        scores.append(int(line))

with open("out.txt", "w") as f:
    for s in scores:
        f.write(str(s) + "\\n")

scores.sort()
\`\`\`
C++:
\`\`\`
ifstream fin("scores.txt");
ofstream fout("out.txt");
vector<int> scores;

int s;
while (fin >> s) {
    scores.push_back(s);
}

for (int x : scores) {
    fout << x << endl;
}

sort(scores.begin(), scores.end());
\`\`\``,
      options: [
        { text: "10, 20, 30, 40", isCorrect: false },
        { text: "30, 20, 10, 40", isCorrect: true },
        { text: "40, 30, 20, 10", isCorrect: false },
        { text: "out.txt is empty / out.txt trống", isCorrect: false },
      ],
      explanation:
        "A program runs top to bottom. When the writing loop runs, the list is still in FILE order; the sort happens only after out.txt is already written, so it changes nothing you can see. The pieces must run in the right order: read → sort → write.\n*Chương trình chạy từ trên xuống dưới. Khi vòng lặp ghi chạy, list vẫn theo thứ tự TRONG TỆP; sort chỉ xảy ra sau khi out.txt đã ghi xong, nên nó không thay đổi gì bạn thấy được. Các phần phải chạy đúng thứ tự: đọc → sắp xếp → ghi.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A11. Writing before reading",
      content: `\`scores.txt\` has 30, 20, 10. What does out.txt contain?
*\`scores.txt\` có 30, 20, 10. out.txt chứa gì?*

Python:
\`\`\`
scores = []

with open("out.txt", "w") as f:
    for s in scores:
        f.write(str(s) + "\\n")

with open("scores.txt") as f:
    for line in f:
        scores.append(int(line))
\`\`\`
C++:
\`\`\`
ifstream fin("scores.txt");
ofstream fout("out.txt");
vector<int> scores;

for (int x : scores) {
    fout << x << endl;
}

int s;
while (fin >> s) {
    scores.push_back(s);
}
\`\`\``,
      options: [
        {
          text: "30, 20, 10 — the scores in file order / 30, 20, 10 — theo thứ tự trong tệp",
          isCorrect: false,
        },
        {
          text: "Error: you cannot write before reading / Lỗi: không được ghi trước khi đọc",
          isCorrect: false,
        },
        {
          text: "out.txt is created but empty / out.txt được tạo nhưng trống",
          isCorrect: true,
        },
        {
          text: "Only 10, the last score / Chỉ có 10, điểm cuối cùng",
          isCorrect: false,
        },
      ],
      explanation:
        "When the writing loop runs, nothing has been read yet — the list is EMPTY, so the loop runs zero times and writes zero lines. Reading fills the list afterwards, but no line of the program writes it any more. There is no error: looping over an empty list is allowed, it just does nothing.\n*Khi vòng lặp ghi chạy, chưa có gì được đọc — list đang TRỐNG, nên vòng lặp chạy 0 lần và ghi 0 dòng. Việc đọc lấp đầy list sau đó, nhưng không còn dòng nào ghi nó ra nữa. Không có lỗi: lặp qua list rỗng là hợp lệ, chỉ là không làm gì.*",
      weight: 2,
    },

    // --- Sorting ---
    {
      type: "single_select",
      title: "A12. Two students with the same score",
      content: `\`scores.txt\` has 70, 60, 70. The program sorts highest first and writes every score. What does out.txt contain? (Lines separated by commas.)
*\`scores.txt\` có 70, 60, 70. Chương trình sắp xếp cao trước và ghi mọi điểm. out.txt chứa gì? (Các dòng cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
def highest_first(score):
    return -score

scores.sort(key=highest_first)
\`\`\`
C++:
\`\`\`
bool highestFirst(int a, int b) {
    return a > b;
}

sort(scores.begin(), scores.end(), highestFirst);
\`\`\``,
      options: [
        { text: "70, 60", isCorrect: false },
        { text: "70, 70, 60", isCorrect: true },
        { text: "60, 70, 70", isCorrect: false },
        { text: "70, 60, 70", isCorrect: false },
      ],
      explanation:
        "Sorting only MOVES values; it never deletes one. Three scores go in, three come out, and the two 70s simply end up next to each other. Getting 70, 60 means you expected sort to remove repeats — it does not, and two students really did score 70.\n*Sắp xếp chỉ DI CHUYỂN giá trị; không bao giờ xóa. Ba điểm vào thì ba điểm ra, hai điểm 70 chỉ đơn giản đứng cạnh nhau. Ra 70, 60 nghĩa là bạn nghĩ sort xóa giá trị trùng — không hề, và hai học sinh thật sự cùng được 70.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A13. Brackets after the function name",
      content: `The student added brackets after the function name. What happens?
*Học sinh thêm dấu ngoặc sau tên hàm. Chuyện gì xảy ra?*

Python:
\`\`\`
def highest_first(score):
    return -score

scores.sort(key=highest_first())
\`\`\`
C++:
\`\`\`
bool highestFirst(int a, int b) {
    return a > b;
}

sort(scores.begin(), scores.end(), highestFirst());
\`\`\``,
      options: [
        {
          text: "Highest first — the brackets make no difference / Cao trước — dấu ngoặc không ảnh hưởng gì",
          isCorrect: false,
        },
        {
          text: "Lowest first — sort skips the function / Thấp trước — sort bỏ qua hàm",
          isCorrect: false,
        },
        {
          text: "Error — the brackets try to RUN the function right now, with no score to give it / Lỗi — dấu ngoặc cố CHẠY hàm ngay lập tức, mà không có điểm nào để đưa vào",
          isCorrect: true,
        },
        {
          text: "Only the first score gets sorted / Chỉ điểm đầu tiên được sắp xếp",
          isCorrect: false,
        },
      ],
      explanation:
        "Without brackets you HAND the function to sort, and sort calls it for you, with a score each time (C++: two scores). With brackets you call it YOURSELF, immediately, and give it nothing — but it needs a score (C++: two). Python stops with an error; g++ refuses to compile.\n*Không có ngoặc là bạn ĐƯA hàm cho sort, và sort tự gọi nó, mỗi lần với một điểm (C++: hai điểm). Có ngoặc là bạn TỰ gọi hàm, ngay lập tức, và không đưa gì vào — nhưng hàm cần một điểm (C++: hai điểm). Python dừng với lỗi; g++ không chịu biên dịch.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A14. The function at the bottom",
      content: `The student put the function at the BOTTOM of the program. What happens?
*Học sinh đặt hàm ở CUỐI chương trình. Chuyện gì xảy ra?*

Python:
\`\`\`
scores = []
# ... read scores.txt into scores here ...

scores.sort(key=highest_first)
# ... write scores into out.txt here ...

def highest_first(score):
    return -score
\`\`\`
C++:
\`\`\`
#include <iostream>
#include <fstream>
#include <vector>
#include <algorithm>
using namespace std;

int main() {
    vector<int> scores;
    // ... read scores.txt into scores here ...

    sort(scores.begin(), scores.end(), highestFirst);
    // ... write scores into out.txt here ...

    return 0;
}

bool highestFirst(int a, int b) {
    return a > b;
}
\`\`\``,
      options: [
        {
          text: "Error — at the sort line, the program has not seen the function yet / Lỗi — tới dòng sort, chương trình chưa hề thấy hàm",
          isCorrect: true,
        },
        {
          text: "Highest first — where you put a function does not matter / Cao trước — đặt hàm ở đâu cũng được",
          isCorrect: false,
        },
        {
          text: "Lowest first — sort ignores a function it cannot find / Thấp trước — sort bỏ qua hàm không tìm thấy",
          isCorrect: false,
        },
        {
          text: "It sorts, then runs the function after sorting / Nó sắp xếp, rồi chạy hàm sau khi sắp xếp",
          isCorrect: false,
        },
      ],
      explanation:
        "Both read top to bottom. Python reaches `sort(key=highest_first)` before the `def` has run, so the name does not exist yet → error. g++ reaches `highestFirst` inside main before it has seen the function → it will not compile. So a function must come BEFORE the line that uses it (C++: above int main()).\n*Cả hai đều đọc từ trên xuống. Python tới `sort(key=highest_first)` trước khi `def` chạy, nên cái tên đó chưa tồn tại → lỗi. g++ gặp `highestFirst` trong main trước khi thấy hàm → không biên dịch. Vì vậy hàm phải nằm TRƯỚC dòng dùng nó (C++: phía trên int main()).*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A15. A function named highest first",
      content: `A student wants the highest score first and writes the function below. \`scores.txt\` has 60, 95, 78. What does out.txt contain? (Lines separated by commas.)
*Học sinh muốn điểm cao nhất lên đầu và viết hàm dưới đây. \`scores.txt\` có 60, 95, 78. out.txt chứa gì? (Các dòng cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
def highest_first(score):
    return score

scores.sort(key=highest_first)
\`\`\`
C++:
\`\`\`
bool highestFirst(int a, int b) {
    return a < b;
}

sort(scores.begin(), scores.end(), highestFirst);
\`\`\``,
      options: [
        { text: "95, 78, 60", isCorrect: false },
        { text: "60, 95, 78", isCorrect: false },
        { text: "Error / Lỗi", isCorrect: false },
        { text: "60, 78, 95", isCorrect: true },
      ],
      explanation:
        'The function\'s NAME means nothing to sort — only what it gives back matters. Python: giving back the score itself sorts by the score, smallest first — exactly like `sort()` with nothing inside. C++: `a < b` says "a comes first when a is SMALLER" — lowest first. Highest first needs `-score` (C++: `a > b`).\n*Với sort, TÊN hàm không có ý nghĩa gì — chỉ giá trị hàm trả về mới quan trọng. Python: trả về chính điểm thì sắp theo điểm, nhỏ trước — y hệt `sort()` không có gì trong ngoặc. C++: `a < b` nói "a đứng trước khi a NHỎ HƠN" — thấp trước. Muốn cao trước phải là `-score` (C++: `a > b`).*',
      weight: 2,
    },
    {
      type: "single_select",
      title: "A16. Subtracting from 100",
      content: `\`scores.txt\` has 60, 95, 78. What does out.txt contain? (Lines separated by commas.)
*\`scores.txt\` có 60, 95, 78. out.txt chứa gì? (Các dòng cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
def order(score):
    return 100 - score

scores.sort(key=order)
\`\`\`
C++:
\`\`\`
bool order(int a, int b) {
    return 100 - a < 100 - b;
}

sort(scores.begin(), scores.end(), order);
\`\`\``,
      options: [
        { text: "95, 78, 60", isCorrect: true },
        { text: "60, 78, 95", isCorrect: false },
        { text: "40, 22, 5", isCorrect: false },
        { text: "5, 22, 40", isCorrect: false },
      ],
      explanation:
        "Python: sort orders by what the function gives back — 60 → 40, 95 → 5, 78 → 22 — smallest first: 5, 22, 40, which are the scores 95, 78, 60. C++: `100 - a < 100 - b` is true exactly when a > b, so it means the same as highestFirst. Either way sort still writes the SCORES; 40, 22, 5 are only used for comparing, never stored.\n*Python: sort xếp theo giá trị hàm trả về — 60 → 40, 95 → 5, 78 → 22 — nhỏ trước: 5, 22, 40, tức là điểm 95, 78, 60. C++: `100 - a < 100 - b` đúng khi và chỉ khi a > b, nên nó giống highestFirst. Dù cách nào, sort vẫn ghi ra ĐIỂM; 40, 22, 5 chỉ dùng để so sánh, không bao giờ được lưu.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A17. Sorting by the last digit",
      content: `\`scores.txt\` has 47, 81, 25. What does out.txt contain? (Lines separated by commas.)
*\`scores.txt\` có 47, 81, 25. out.txt chứa gì? (Các dòng cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
def last_digit(score):
    return score % 10

scores.sort(key=last_digit)
\`\`\`
C++:
\`\`\`
bool lastDigit(int a, int b) {
    return a % 10 < b % 10;
}

sort(scores.begin(), scores.end(), lastDigit);
\`\`\``,
      options: [
        { text: "25, 47, 81", isCorrect: false },
        { text: "81, 47, 25", isCorrect: false },
        { text: "81, 25, 47", isCorrect: true },
        { text: "1, 5, 7", isCorrect: false },
      ],
      explanation:
        "The function decides WHAT is compared. Here only the last digit counts: 47 → 7, 81 → 1, 25 → 5. Ordering 1, 5, 7 gives 81, 25, 47 — the size of the score never matters. This is why the function is a real tool: it can put scores in ANY order you can describe, not just flip it.\n*Hàm quyết định CÁI GÌ được so sánh. Ở đây chỉ chữ số cuối được tính: 47 → 7, 81 → 1, 25 → 5. Xếp 1, 5, 7 cho ra 81, 25, 47 — độ lớn của điểm không hề quan trọng. Vì vậy hàm là công cụ thật: nó xếp điểm theo BẤT KỲ thứ tự nào bạn mô tả được, không chỉ đảo ngược.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A18. The last position",
      content: `\`scores.txt\` has 60, 95, 78, already read into \`scores\`. What does this print?
*\`scores.txt\` có 60, 95, 78, đã được đọc vào \`scores\`. Đoạn này in ra gì?*

Python:
\`\`\`
def highest_first(score):
    return -score

scores.sort(key=highest_first)
print(scores[len(scores) - 1])
\`\`\`
C++:
\`\`\`
bool highestFirst(int a, int b) {
    return a > b;
}

sort(scores.begin(), scores.end(), highestFirst);
cout << scores[scores.size() - 1] << endl;
\`\`\``,
      options: [
        { text: "95", isCorrect: false },
        { text: "78", isCorrect: false },
        {
          text: "Error: index out of range / Lỗi: chỉ số ngoài phạm vi",
          isCorrect: false,
        },
        { text: "60", isCorrect: true },
      ],
      explanation:
        'After sorting highest first, the list is 95, 78, 60 — so the LAST position (length - 1 = 2) now holds the SMALLEST score. A position has no fixed meaning like "biggest"; it holds whatever the sort put there. 78 is what index 2 held before sorting.\n*Sau khi sắp cao trước, list là 95, 78, 60 — nên vị trí CUỐI (length - 1 = 2) giờ chứa điểm NHỎ NHẤT. Vị trí không có nghĩa cố định kiểu "lớn nhất"; nó chứa thứ mà sort đặt vào. 78 là thứ chỉ số 2 chứa trước khi sắp xếp.*',
      weight: 2,
    },
    {
      type: "single_select",
      title: "A19. Walking backwards",
      content: `\`scores.txt\` has 60, 95, 78, already read into \`scores\`. What does out.txt contain? (Lines separated by commas.)
*\`scores.txt\` có 60, 95, 78, đã được đọc vào \`scores\`. out.txt chứa gì? (Các dòng cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
scores.sort()

with open("out.txt", "w") as f:
    for i in range(len(scores)):
        f.write(str(scores[len(scores) - 1 - i]) + "\\n")
\`\`\`
C++:
\`\`\`
sort(scores.begin(), scores.end());

ofstream fout("out.txt");
for (int i = 0; i < scores.size(); i++) {
    fout << scores[scores.size() - 1 - i] << endl;
}
\`\`\``,
      options: [
        { text: "60, 78, 95", isCorrect: false },
        { text: "95, 78, 60", isCorrect: true },
        { text: "78, 95, 60", isCorrect: false },
        {
          text: "Error: index out of range / Lỗi: chỉ số ngoài phạm vi",
          isCorrect: false,
        },
      ],
      explanation:
        "After `sort()` the list is 60, 78, 95. Then i = 0 reads index 2 (95), i = 1 reads index 1 (78), i = 2 reads index 0 (60): the loop walks the sorted list BACKWARDS. The `- 1` is what keeps it safe — without it, i = 0 would ask for index 3, which does not exist.\n*Sau `sort()` list là 60, 78, 95. Rồi i = 0 đọc chỉ số 2 (95), i = 1 đọc chỉ số 1 (78), i = 2 đọc chỉ số 0 (60): vòng lặp đi NGƯỢC qua list đã sắp. Chính `- 1` giữ cho nó an toàn — thiếu nó, i = 0 sẽ đòi chỉ số 3, vốn không tồn tại.*",
      weight: 2,
    },

    // --- Name and score ---
    {
      type: "single_select",
      title: "A20. Finding the best student",
      content: `\`students.txt\` has 3 lines: \`An 87\`, \`Binh 92\`, \`Chi 78\`. They were read into \`names\` and \`scores\` in file order. What does this print?
*\`students.txt\` có 3 dòng: \`An 87\`, \`Binh 92\`, \`Chi 78\`. Chúng đã được đọc vào \`names\` và \`scores\` theo thứ tự trong tệp. Đoạn này in ra gì?*

Python:
\`\`\`
best_score = 0
best_name = ""
for i in range(len(names)):
    if scores[i] > best_score:
        best_score = scores[i]
    best_name = names[i]
print(best_name, best_score)
\`\`\`
C++:
\`\`\`
int bestScore = 0;
string bestName = "";
for (int i = 0; i < names.size(); i++) {
    if (scores[i] > bestScore) {
        bestScore = scores[i];
    }
    bestName = names[i];
}
cout << bestName << " " << bestScore << endl;
\`\`\``,
      options: [
        { text: "Binh 92", isCorrect: false },
        { text: "Chi 78", isCorrect: false },
        { text: "Chi 92", isCorrect: true },
        { text: "An 87", isCorrect: false },
      ],
      explanation:
        "`best_name = names[i]` is OUTSIDE the if (Python: less indented; C++: after the closing brace), so it runs on EVERY pass and ends up as the last name, Chi. The score was only updated when it was bigger, so it stays 92. The result pairs a name with a score that is not hers. Both updates belong INSIDE the if, so they always change together.\n*`best_name = names[i]` nằm NGOÀI câu if (Python: thụt vào ít hơn; C++: sau dấu ngoặc đóng), nên nó chạy ở MỌI lượt và cuối cùng là tên cuối, Chi. Điểm chỉ cập nhật khi lớn hơn, nên vẫn là 92. Kết quả ghép một cái tên với điểm không phải của bạn ấy. Cả hai phép gán phải nằm TRONG câu if để luôn thay đổi cùng nhau.*",
      weight: 2,
    },

    // ==================== PART B — FILE INPUT / OUTPUT ====================
    // Same pattern every time: read the file → (process) → write the answer file.
    // B1–B7 easy (weight 4), B8–B10 medium (weight 6). Answer in Python OR C++.

    {
      type: "free_text",
      title: "B1. Copy the Scores",
      content: `\`scores.txt\` has one score per line. Write every score into \`out.txt\`, one per line, in the same order as the file.
*\`scores.txt\` có mỗi dòng một điểm. Ghi mọi điểm vào \`out.txt\`, mỗi dòng một điểm, đúng thứ tự trong tệp.*

**Example scores.txt:**
\`\`\`
87
92
78
\`\`\`

**out.txt should be:**
\`\`\`
87
92
78
\`\`\``,
      referenceAnswer: `# Python
scores = []

with open("scores.txt") as f:
    for line in f:
        scores.append(int(line))

with open("out.txt", "w") as f:
    for s in scores:
        f.write(str(s) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
using namespace std;

int main() {
    ifstream fin("scores.txt");
    ofstream fout("out.txt");
    vector<int> scores;

    int s;
    while (fin >> s) {
        scores.push_back(s);
    }

    for (int x : scores) {
        fout << x << endl;
    }

    return 0;
}`,
      explanation: `The skeleton of every file problem: read everything into a list → write it out. Python: write() only takes text, so str(s), plus "\\n" for the new line.
*Khung của mọi bài về tệp: đọc hết vào list → ghi ra. Python: write() chỉ nhận chữ, nên cần str(s), cộng "\\n" để xuống dòng.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B2. Five Bonus Points",
      content: `\`scores.txt\` has one score per line. Every student gets 5 bonus points. Write each new score into \`out.txt\`, one per line, in the same order as the file.
*\`scores.txt\` có mỗi dòng một điểm. Mỗi học sinh được cộng 5 điểm thưởng. Ghi từng điểm mới vào \`out.txt\`, mỗi dòng một điểm, đúng thứ tự trong tệp.*

**Example scores.txt:**
\`\`\`
87
40
78
\`\`\`

**out.txt should be:**
\`\`\`
92
45
83
\`\`\``,
      referenceAnswer: `# Python
scores = []

with open("scores.txt") as f:
    for line in f:
        scores.append(int(line))

with open("out.txt", "w") as f:
    for s in scores:
        f.write(str(s + 5) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
using namespace std;

int main() {
    ifstream fin("scores.txt");
    ofstream fout("out.txt");
    vector<int> scores;

    int s;
    while (fin >> s) {
        scores.push_back(s);
    }

    for (int x : scores) {
        fout << x + 5 << endl;
    }

    return 0;
}`,
      explanation: `Same skeleton as B1; only the value written changes. Python: add BEFORE converting — str(s + 5). Without int(line) the scores are text and + 5 fails.
*Cùng khung với B1; chỉ giá trị được ghi thay đổi. Python: cộng TRƯỚC khi đổi sang chữ — str(s + 5). Thiếu int(line) thì điểm là chữ và + 5 bị lỗi.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B3. Count and Total",
      content: `\`scores.txt\` has one score per line. Write two lines into \`out.txt\`: the first line is how many scores there are, the second line is the total of all scores.
*\`scores.txt\` có mỗi dòng một điểm. Ghi hai dòng vào \`out.txt\`: dòng đầu là có bao nhiêu điểm, dòng thứ hai là tổng tất cả các điểm.*

**Example scores.txt:**
\`\`\`
87
92
78
\`\`\`

**out.txt should be:**
\`\`\`
3
257
\`\`\``,
      referenceAnswer: `# Python
scores = []

with open("scores.txt") as f:
    for line in f:
        scores.append(int(line))

total = 0
for s in scores:
    total = total + s

with open("out.txt", "w") as f:
    f.write(str(len(scores)) + "\\n")
    f.write(str(total) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
using namespace std;

int main() {
    ifstream fin("scores.txt");
    ofstream fout("out.txt");
    vector<int> scores;

    int s;
    while (fin >> s) {
        scores.push_back(s);
    }

    int total = 0;
    for (int x : scores) {
        total = total + x;
    }

    fout << scores.size() << endl;
    fout << total << endl;

    return 0;
}`,
      explanation: `Read → compute → write. The count is the list's length; the total uses the accumulator (total = total + s). Each value needs its own new line, or out.txt shows 3257.
*Đọc → tính → ghi. Số lượng là độ dài list; tổng dùng mẫu tích lũy (total = total + s). Mỗi giá trị cần xuống dòng riêng, nếu không out.txt sẽ là 3257.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B4. Passing Scores Only",
      content: `\`scores.txt\` has one score per line. Write into \`out.txt\` only the scores that are 50 or more, one per line, in the same order as the file.
*\`scores.txt\` có mỗi dòng một điểm. Chỉ ghi vào \`out.txt\` những điểm từ 50 trở lên, mỗi dòng một điểm, đúng thứ tự trong tệp.*

**Example scores.txt:**
\`\`\`
49
50
91
12
\`\`\`

**out.txt should be:**
\`\`\`
50
91
\`\`\``,
      referenceAnswer: `# Python
scores = []

with open("scores.txt") as f:
    for line in f:
        scores.append(int(line))

with open("out.txt", "w") as f:
    for s in scores:
        if s >= 50:
            f.write(str(s) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
using namespace std;

int main() {
    ifstream fin("scores.txt");
    ofstream fout("out.txt");
    vector<int> scores;

    int s;
    while (fin >> s) {
        scores.push_back(s);
    }

    for (int x : scores) {
        if (x >= 50) {
            fout << x << endl;
        }
    }

    return 0;
}`,
      explanation: `An if inside the writing loop decides which lines get written. "50 or more" is >= 50 — with > 50 the score 50 would be missing.
*Câu if trong vòng lặp ghi quyết định dòng nào được ghi. "Từ 50 trở lên" là >= 50 — dùng > 50 sẽ mất điểm 50.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B5. Highest First",
      content: `\`scores.txt\` has one score per line. Write every score into \`out.txt\`, one per line, from the highest to the lowest. Use a function to tell sort the order.
*\`scores.txt\` có mỗi dòng một điểm. Ghi mọi điểm vào \`out.txt\`, mỗi dòng một điểm, từ cao nhất đến thấp nhất. Dùng một hàm để nói cho sort biết thứ tự.*

**Example scores.txt:**
\`\`\`
78
95
60
87
\`\`\`

**out.txt should be:**
\`\`\`
95
87
78
60
\`\`\``,
      referenceAnswer: `# Python
def highest_first(score):
    return -score

scores = []

with open("scores.txt") as f:
    for line in f:
        scores.append(int(line))

scores.sort(key=highest_first)

with open("out.txt", "w") as f:
    for s in scores:
        f.write(str(s) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
#include <algorithm>
using namespace std;

bool highestFirst(int a, int b) {
    return a > b;
}

int main() {
    ifstream fin("scores.txt");
    ofstream fout("out.txt");
    vector<int> scores;

    int s;
    while (fin >> s) {
        scores.push_back(s);
    }

    sort(scores.begin(), scores.end(), highestFirst);

    for (int x : scores) {
        fout << x << endl;
    }

    return 0;
}`,
      explanation: `Read → sort with the function → write. The function goes at the top (C++: above main), and is passed WITHOUT brackets. C++: no = in the comparison (a > b, never a >= b).
*Đọc → sắp xếp bằng hàm → ghi. Hàm đặt ở đầu (C++: phía trên main), và được truyền KHÔNG có dấu ngoặc. C++: không có dấu = trong phép so sánh (a > b, không bao giờ a >= b).*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B6. Names Only",
      content: `\`students.txt\` has a name and a score on each line. Write only the names into \`out.txt\`, one per line, in the same order as the file.
*\`students.txt\` mỗi dòng có một tên và một điểm. Chỉ ghi các tên vào \`out.txt\`, mỗi dòng một tên, đúng thứ tự trong tệp.*

**Example students.txt:**
\`\`\`
Tuyet 60
Cong 53
Hai 67
\`\`\`

**out.txt should be:**
\`\`\`
Tuyet
Cong
Hai
\`\`\``,
      referenceAnswer: `# Python
names = []

with open("students.txt") as f:
    for line in f:
        name, score = line.split()
        names.append(name)

with open("out.txt", "w") as f:
    for name in names:
        f.write(name + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
using namespace std;

int main() {
    ifstream fin("students.txt");
    ofstream fout("out.txt");
    vector<string> names;

    string name;
    int score;
    while (fin >> name >> score) {
        names.push_back(name);
    }

    for (string n : names) {
        fout << n << endl;
    }

    return 0;
}`,
      explanation: `Every line must still be read as TWO things (name and score), even though only the name is used. Python: split() then keep the first piece. C++: fin >> name >> score — reading only fin >> name would take the score as the next name.
*Mỗi dòng vẫn phải đọc thành HAI thứ (tên và điểm), dù chỉ dùng tên. Python: split() rồi giữ phần đầu. C++: fin >> name >> score — nếu chỉ đọc fin >> name thì điểm sẽ bị lấy làm tên tiếp theo.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B7. Score Sentences",
      content: `\`students.txt\` has a name and a score on each line. For every student, write one line into \`out.txt\` in the form \`NAME got SCORE\`, in the same order as the file.
*\`students.txt\` mỗi dòng có một tên và một điểm. Với mỗi học sinh, ghi một dòng vào \`out.txt\` theo dạng \`TÊN got ĐIỂM\`, đúng thứ tự trong tệp.*

**Example students.txt:**
\`\`\`
Tuyet 60
Cong 53
Hai 67
\`\`\`

**out.txt should be:**
\`\`\`
Tuyet got 60
Cong got 53
Hai got 67
\`\`\``,
      referenceAnswer: `# Python
names = []
scores = []

with open("students.txt") as f:
    for line in f:
        name, score = line.split()
        names.append(name)
        scores.append(int(score))

with open("out.txt", "w") as f:
    for i in range(len(names)):
        f.write(names[i] + " got " + str(scores[i]) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
using namespace std;

int main() {
    ifstream fin("students.txt");
    ofstream fout("out.txt");
    vector<string> names;
    vector<int> scores;

    string name;
    int score;
    while (fin >> name >> score) {
        names.push_back(name);
        scores.push_back(score);
    }

    for (int i = 0; i < names.size(); i++) {
        fout << names[i] << " got " << scores[i] << endl;
    }

    return 0;
}`,
      explanation: `Two lists filled side by side: names[i] and scores[i] belong to the same student because they were added in the same pass. The spaces around "got" must be written too.
*Hai list được điền song song: names[i] và scores[i] thuộc cùng một học sinh vì được thêm vào trong cùng một lượt. Dấu cách quanh "got" cũng phải được ghi.*`,
      weight: 4,
    },

    // --- Medium (weight 6) ---
    {
      type: "free_text",
      title: "B8. The Best Student",
      content: `\`students.txt\` has a name and a score on each line. Write the name and score of the student with the HIGHEST score into \`out.txt\`, on one line. If two students share the highest score, write the one who comes first in the file. Do NOT sort — find the best student with a loop.
*\`students.txt\` mỗi dòng có một tên và một điểm. Ghi tên và điểm của học sinh có điểm CAO NHẤT vào \`out.txt\`, trên một dòng. Nếu hai học sinh cùng điểm cao nhất, ghi bạn đứng trước trong tệp. KHÔNG sắp xếp — tìm học sinh giỏi nhất bằng vòng lặp.*

**Example students.txt:**
\`\`\`
An 87
Binh 95
Chi 78
Dung 95
\`\`\`

**out.txt should be:**
\`\`\`
Binh 95
\`\`\``,
      referenceAnswer: `# Python
names = []
scores = []

with open("students.txt") as f:
    for line in f:
        name, score = line.split()
        names.append(name)
        scores.append(int(score))

best = 0
for i in range(len(scores)):
    if scores[i] > scores[best]:
        best = i

with open("out.txt", "w") as f:
    f.write(names[best] + " " + str(scores[best]) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
using namespace std;

int main() {
    ifstream fin("students.txt");
    ofstream fout("out.txt");
    vector<string> names;
    vector<int> scores;

    string name;
    int score;
    while (fin >> name >> score) {
        names.push_back(name);
        scores.push_back(score);
    }

    int best = 0;
    for (int i = 0; i < scores.size(); i++) {
        if (scores[i] > scores[best]) {
            best = i;
        }
    }

    fout << names[best] << " " << scores[best] << endl;

    return 0;
}`,
      explanation: `Remember the POSITION of the best student, not just the score — then names[best] and scores[best] can never belong to different students. Strict > keeps the first one on a tie (>= would move to Dung).
*Hãy nhớ VỊ TRÍ của học sinh giỏi nhất, không chỉ điểm — khi đó names[best] và scores[best] không thể thuộc hai học sinh khác nhau. Dùng > (không bằng) giữ bạn đứng trước khi bằng điểm (>= sẽ chuyển sang Dung).*`,
      weight: 6,
    },
    {
      type: "free_text",
      title: "B9. Pass File and Fail File",
      content: `\`students.txt\` has a name and a score on each line. Write the names of students with 50 or more into \`pass.txt\`, and the names of everyone else into \`fail.txt\`. One name per line, in the same order as the file.
*\`students.txt\` mỗi dòng có một tên và một điểm. Ghi tên các học sinh từ 50 điểm trở lên vào \`pass.txt\`, và tên những bạn còn lại vào \`fail.txt\`. Mỗi dòng một tên, đúng thứ tự trong tệp.*

**Example students.txt:**
\`\`\`
Tuyet 60
Cong 49
Hai 50
Loan 12
\`\`\`

**pass.txt should be:**
\`\`\`
Tuyet
Hai
\`\`\`

**fail.txt should be:**
\`\`\`
Cong
Loan
\`\`\``,
      referenceAnswer: `# Python
names = []
scores = []

with open("students.txt") as f:
    for line in f:
        name, score = line.split()
        names.append(name)
        scores.append(int(score))

with open("pass.txt", "w") as f:
    for i in range(len(names)):
        if scores[i] >= 50:
            f.write(names[i] + "\\n")

with open("fail.txt", "w") as f:
    for i in range(len(names)):
        if scores[i] < 50:
            f.write(names[i] + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
using namespace std;

int main() {
    ifstream fin("students.txt");
    ofstream passFile("pass.txt");
    ofstream failFile("fail.txt");
    vector<string> names;
    vector<int> scores;

    string name;
    int score;
    while (fin >> name >> score) {
        names.push_back(name);
        scores.push_back(score);
    }

    for (int i = 0; i < names.size(); i++) {
        if (scores[i] >= 50) {
            passFile << names[i] << endl;
        } else {
            failFile << names[i] << endl;
        }
    }

    return 0;
}`,
      explanation: `Two output files are just the writing step done twice, each with its own file name. The two conditions must cover every student exactly once: >= 50 and < 50 (50 itself passes).
*Hai tệp đầu ra chỉ là bước ghi làm hai lần, mỗi lần một tên tệp. Hai điều kiện phải phủ mọi học sinh đúng một lần: >= 50 và < 50 (điểm 50 là đạt).*`,
      weight: 6,
    },
    {
      type: "free_text",
      title: "B10. Two Classes, One List",
      content: `\`class-a.txt\` and \`class-b.txt\` each have one score per line. Write ALL scores from both files into \`out.txt\`, one per line, from the highest to the lowest. Use a function to tell sort the order.
*\`class-a.txt\` và \`class-b.txt\` mỗi tệp có mỗi dòng một điểm. Ghi TẤT CẢ điểm của cả hai tệp vào \`out.txt\`, mỗi dòng một điểm, từ cao nhất đến thấp nhất. Dùng một hàm để nói cho sort biết thứ tự.*

**Example class-a.txt:**
\`\`\`
70
95
\`\`\`

**Example class-b.txt:**
\`\`\`
88
60
99
\`\`\`

**out.txt should be:**
\`\`\`
99
95
88
70
60
\`\`\``,
      referenceAnswer: `# Python
def highest_first(score):
    return -score

scores = []

with open("class-a.txt") as f:
    for line in f:
        scores.append(int(line))

with open("class-b.txt") as f:
    for line in f:
        scores.append(int(line))

scores.sort(key=highest_first)

with open("out.txt", "w") as f:
    for s in scores:
        f.write(str(s) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
#include <algorithm>
using namespace std;

bool highestFirst(int a, int b) {
    return a > b;
}

int main() {
    ifstream finA("class-a.txt");
    ifstream finB("class-b.txt");
    ofstream fout("out.txt");
    vector<int> scores;

    int s;
    while (finA >> s) {
        scores.push_back(s);
    }
    while (finB >> s) {
        scores.push_back(s);
    }

    sort(scores.begin(), scores.end(), highestFirst);

    for (int x : scores) {
        fout << x << endl;
    }

    return 0;
}`,
      explanation: `Read BOTH files into the SAME list, then sort once, then write once. Sorting each file separately and writing one after the other gives 95 70 99 88 60 — wrong.
*Đọc CẢ HAI tệp vào CÙNG một list, rồi sắp xếp một lần, rồi ghi một lần. Sắp xếp từng tệp riêng rồi ghi nối tiếp sẽ ra 95 70 99 88 60 — sai.*`,
      weight: 6,
    },
  ],
};
