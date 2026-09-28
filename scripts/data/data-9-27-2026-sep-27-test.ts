/**
 * Sep 27 Test — 30 questions, Python-or-C++ (bilingual EN/VN).
 *
 * Fourth test in the series (after Sep 13). Scope is the WHOLE "Files, Sorting & Records"
 * lesson, sections 0–9: running from the lesson folder, reading a file, sort(), writing
 * out.txt, highest-first via a named function (key= / comparison function), reading name +
 * score, keeping them together as a tuple (C++: pair) and sorting records, what changed,
 * and the section 9 exercises (incl. top 3 with places and closest to 75).
 * Nothing beyond the lesson: no lambdas, reverse / rbegin, struct, dicts, or tie-break keys.
 *
 * Structure:
 *   Part A — 20 concept MC (single_select, weight 2), about two per lesson section,
 *            misconception-targeted, Python + C++ snippets give the SAME answer; bilingual
 *            explanation revealed after release. Correct option position varies (5 each).
 *   Part B — 10 file input/output programs, read → (process) → write every time:
 *            B1–B7 easy (weight 4), B8–B10 medium (weight 6).
 * No tied scores in any snippet or example: C++'s sort does not keep tied rows in file
 * order, so a tie would give Python and C++ two different right answers.
 * Grade split: MC 40 / coding 46, same as Sep 13. Graded, untimed, exam-safe flags.
 * referenceAnswer carries a Python AND a C++ solution (teacher/AI-grader facing).
 *
 * Seed: bun scripts/create-test.ts scripts/data/data-9-27-2026-sep-27-test.ts
 */
export default {
  courseId: "c98f8f96-916d-48e0-a67b-a161c2cf422c",
  test: {
    title: "Sep 27 Test",
    description:
      "Files, sorting & records. Part B: use Python or C++; read the given file, write to the given file.\n*Tệp, sắp xếp & bản ghi. Phần B: dùng Python hoặc C++; đọc tệp đã cho, ghi vào tệp đã cho.*",
    showCorrectAnswerAfterSubmit: false,
    showGradeAfterSubmit: false,
  },
  questions: [
    // ==================== PART A — CONCEPT MC (weight 2 each) ====================

    // --- Section 0: running your program ---
    {
      type: "single_select",
      title: "A1. Where out.txt appears",
      content:
        'Your program is in the `helloworld` folder, and you run it from Git Bash opened in that same folder. It writes with Python `open("out.txt", "w")` (C++: `ofstream fout("out.txt")`), and `out.txt` does not exist yet. Where does `out.txt` appear?\n*Chương trình nằm trong thư mục `helloworld`, và bạn chạy nó từ Git Bash mở ngay trong thư mục đó. Nó ghi bằng Python `open("out.txt", "w")` (C++: `ofstream fout("out.txt")`), và `out.txt` chưa tồn tại. `out.txt` xuất hiện ở đâu?*',
      options: [
        {
          text: "In the Downloads folder, where new files go / Trong thư mục Downloads, nơi tệp mới được lưu",
          isCorrect: false,
        },
        {
          text: "Nowhere — you must create out.txt by hand before running / Không ở đâu cả — phải tự tạo out.txt trước khi chạy",
          isCorrect: false,
        },
        {
          text: "In the helloworld folder, next to the program / Trong thư mục helloworld, cạnh chương trình",
          isCorrect: true,
        },
        {
          text: "On the Desktop / Trên Desktop",
          isCorrect: false,
        },
      ],
      explanation:
        '`"out.txt"` is only a NAME, not a location — the same rule as when reading. The program creates the file in the folder it runs in, which here is helloworld. Opening a file for writing creates it when it does not exist yet, so you never make it by hand.\n*`"out.txt"` chỉ là một cái TÊN, không phải vị trí — giống quy tắc khi đọc. Chương trình tạo tệp trong thư mục nó đang chạy, ở đây là helloworld. Mở tệp để ghi sẽ tự tạo tệp nếu chưa có, nên bạn không bao giờ phải tự tạo.*',
      weight: 2,
    },

    // --- Section 1: the problem ---
    {
      type: "single_select",
      title: "A2. Why a file?",
      content:
        "A program needs the scores of 100 students. Why is it better to read them from `scores.txt` than to type them in with `input()` (C++: `cin`) every time?\n*Một chương trình cần điểm của 100 học sinh. Vì sao đọc chúng từ `scores.txt` lại tốt hơn là gõ vào bằng `input()` (C++: `cin`) mỗi lần?*",
      options: [
        {
          text: "The data is typed once into the file, and every test run reads exactly the same data — nothing to retype, no typing mistakes / Dữ liệu chỉ gõ một lần vào tệp, và mỗi lần chạy thử đều đọc đúng dữ liệu đó — không phải gõ lại, không gõ sai",
          isCorrect: true,
        },
        {
          text: "input() (C++: cin) can only read up to 10 values / input() (C++: cin) chỉ đọc được tối đa 10 giá trị",
          isCorrect: false,
        },
        {
          text: "Reading a file sorts the scores automatically / Đọc tệp sẽ tự sắp xếp điểm",
          isCorrect: false,
        },
        {
          text: "A program that reads a file cannot have mistakes / Chương trình đọc tệp thì không thể sai",
          isCorrect: false,
        },
      ],
      explanation:
        "Typing 100 numbers on every test run is slow, and one typo changes the answer. In a file the data is written once and read the same way on every run, so you can test again and again. Reading a file does not sort anything, and a program that reads a file can still be wrong.\n*Gõ 100 số mỗi lần chạy thử thì chậm, và gõ sai một số là kết quả thay đổi. Trong tệp, dữ liệu chỉ viết một lần và được đọc y như nhau ở mọi lần chạy, nên bạn chạy thử bao nhiêu lần cũng được. Đọc tệp không sắp xếp gì cả, và chương trình đọc tệp vẫn có thể sai.*",
      weight: 2,
    },

    // --- Section 2: reading a file ---
    {
      type: "single_select",
      title: "A3. The total that keeps restarting",
      content: `What does this print?
*Đoạn này in ra gì?*

**scores.txt:**
\`\`\`
30
20
10
\`\`\`
Python:
\`\`\`
with open("scores.txt") as f:
    for line in f:
        total = 0
        total = total + int(line)
print(total)
\`\`\`
C++:
\`\`\`
ifstream fin("scores.txt");
int total;
int s;
while (fin >> s) {
    total = 0;
    total = total + s;
}
cout << total << endl;
\`\`\``,
      options: [
        { text: "60", isCorrect: false },
        { text: "0", isCorrect: false },
        { text: "30", isCorrect: false },
        { text: "10", isCorrect: true },
      ],
      explanation:
        "`total = 0` is INSIDE the loop, so it runs on every pass and wipes out what was added before. On the last pass total becomes 0, then 0 + 10 = 10. The starting value must be set once, BEFORE the loop — then the answer is 60.\n*`total = 0` nằm TRONG vòng lặp, nên nó chạy ở mọi lượt và xóa những gì đã cộng trước đó. Ở lượt cuối total thành 0, rồi 0 + 10 = 10. Giá trị ban đầu phải gán một lần, TRƯỚC vòng lặp — khi đó mới ra 60.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A4. Reading the same file twice",
      content: `What does this print?
*Đoạn này in ra gì?*

**scores.txt:**
\`\`\`
30
20
10
\`\`\`
Python:
\`\`\`
count = 0
total = 0
with open("scores.txt") as f:
    for line in f:
        count = count + 1
    for line in f:
        total = total + int(line)
print(count, total)
\`\`\`
C++:
\`\`\`
ifstream fin("scores.txt");
int count = 0;
int total = 0;
int s;
while (fin >> s) {
    count = count + 1;
}
while (fin >> s) {
    total = total + s;
}
cout << count << " " << total << endl;
\`\`\``,
      options: [
        { text: "3 60", isCorrect: false },
        { text: "3 0", isCorrect: true },
        { text: "0 0", isCorrect: false },
        { text: "6 60", isCorrect: false },
      ],
      explanation:
        "Reading only moves forward through the file and never goes back by itself. The first loop reads to the end, so the second loop starts at the end, finds nothing, and runs zero times — total stays 0, with no error. That is why programs read the file ONCE into a list: a list can be looped over as many times as you like.\n*Việc đọc chỉ đi tới trong tệp và không tự quay lại. Vòng lặp đầu đọc tới cuối tệp, nên vòng thứ hai bắt đầu ở cuối, không thấy gì, và chạy 0 lần — total vẫn là 0, không có lỗi. Vì vậy chương trình đọc tệp MỘT lần vào list: list thì lặp bao nhiêu lần cũng được.*",
      weight: 2,
    },

    // --- Section 3: sorting ---
    {
      type: "single_select",
      title: "A5. Saving what sort gives back",
      content: `What happens?
*Chuyện gì xảy ra?*

Python:
\`\`\`
scores = [30, 20, 10]
scores = scores.sort()
for s in scores:
    print(s)
\`\`\`
C++:
\`\`\`
vector<int> scores = {30, 20, 10};
scores = sort(scores.begin(), scores.end());
for (int x : scores) {
    cout << x << endl;
}
\`\`\``,
      options: [
        { text: "10, 20, 30 are printed / In ra 10, 20, 30", isCorrect: false },
        { text: "30, 20, 10 are printed / In ra 30, 20, 10", isCorrect: false },
        {
          text: "Error — sort gives back nothing, so there is no sorted list to store in scores / Lỗi — sort không trả về gì, nên không có list đã sắp xếp nào để lưu vào scores",
          isCorrect: true,
        },
        {
          text: "Nothing is printed, and there is no error / Không in gì, và không có lỗi",
          isCorrect: false,
        },
      ],
      explanation:
        "sort rearranges the list ITSELF and gives nothing back. Python: `scores.sort()` gives back None, so scores now holds None instead of a list, and the for loop stops with an error. C++: sort gives back nothing, so the `=` has nothing to store and g++ refuses to compile. Sort on a line of its own: `scores.sort()` (C++: `sort(scores.begin(), scores.end());`).\n*sort sắp xếp lại CHÍNH list đó và không trả về gì. Python: `scores.sort()` trả về None, nên scores giờ chứa None chứ không còn là list, và vòng for dừng với lỗi. C++: sort không trả về gì, nên dấu `=` không có gì để lưu và g++ không chịu biên dịch. Hãy sort trên một dòng riêng: `scores.sort()` (C++: `sort(scores.begin(), scores.end());`).*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A6. A score added after sorting",
      content: `What does out.txt contain? (Lines separated by commas.)
*out.txt chứa gì? (Các dòng cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
scores = [30, 20, 10]
scores.sort()
scores.append(25)

with open("out.txt", "w") as f:
    for s in scores:
        f.write(str(s) + "\\n")
\`\`\`
C++:
\`\`\`
vector<int> scores = {30, 20, 10};
sort(scores.begin(), scores.end());
scores.push_back(25);

ofstream fout("out.txt");
for (int x : scores) {
    fout << x << endl;
}
\`\`\``,
      options: [
        { text: "10, 20, 30, 25", isCorrect: true },
        { text: "10, 20, 25, 30", isCorrect: false },
        { text: "30, 20, 10, 25", isCorrect: false },
        { text: "25, 10, 20, 30", isCorrect: false },
      ],
      explanation:
        "sort puts the list in order at the moment it runs — it does not keep it in order afterwards. 25 is added after the sort, so it simply goes to the end. To have 25 in its place, add it first and sort after.\n*sort xếp list theo thứ tự ngay lúc nó chạy — nó không giữ list luôn có thứ tự về sau. 25 được thêm sau khi sort, nên nó chỉ đơn giản nằm ở cuối. Muốn 25 đúng chỗ, hãy thêm nó trước rồi mới sort.*",
      weight: 2,
    },

    // --- Section 4: writing a file ---
    {
      type: "single_select",
      title: "A7. Opening out.txt inside the loop",
      content: `What does out.txt contain? (Lines separated by commas.)
*out.txt chứa gì? (Các dòng cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
scores = [10, 20, 30]

for s in scores:
    with open("out.txt", "w") as f:
        f.write(str(s) + "\\n")
\`\`\`
C++:
\`\`\`
vector<int> scores = {10, 20, 30};

for (int x : scores) {
    ofstream fout("out.txt");
    fout << x << endl;
}
\`\`\``,
      options: [
        { text: "10, 20, 30", isCorrect: false },
        { text: "10", isCorrect: false },
        { text: "30, 20, 10", isCorrect: false },
        { text: "30", isCorrect: true },
      ],
      explanation:
        "Opening a file for writing starts it EMPTY. Here the file is opened inside the loop, so every pass wipes out.txt and then writes one score — only the last one, 30, is left. Open the file once, before the loop, and write inside the loop.\n*Mở tệp để ghi sẽ làm tệp TRỐNG lại từ đầu. Ở đây tệp được mở trong vòng lặp, nên mỗi lượt đều xóa sạch out.txt rồi ghi một điểm — chỉ còn lại điểm cuối, 30. Hãy mở tệp một lần, trước vòng lặp, rồi ghi bên trong vòng lặp.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A8. Running the program twice",
      content: `You run this program once, then run it AGAIN without changing anything. How many lines does out.txt have now?
*Bạn chạy chương trình này một lần, rồi chạy LẠI mà không sửa gì. Giờ out.txt có bao nhiêu dòng?*

Python:
\`\`\`
scores = [10, 20, 30]

with open("out.txt", "w") as f:
    for s in scores:
        f.write(str(s) + "\\n")
\`\`\`
C++:
\`\`\`
vector<int> scores = {10, 20, 30};

ofstream fout("out.txt");
for (int x : scores) {
    fout << x << endl;
}
\`\`\``,
      options: [
        {
          text: "6 — the second run adds 3 more lines / 6 — lần chạy thứ hai thêm 3 dòng nữa",
          isCorrect: false,
        },
        {
          text: "3 — opening for writing starts out.txt empty, so the second run replaces the first / 3 — mở để ghi làm out.txt trống lại, nên lần chạy thứ hai thay thế lần đầu",
          isCorrect: true,
        },
        {
          text: "0 — the second run deletes out.txt / 0 — lần chạy thứ hai xóa out.txt",
          isCorrect: false,
        },
        {
          text: "An error, because out.txt already exists / Lỗi, vì out.txt đã tồn tại",
          isCorrect: false,
        },
      ],
      explanation:
        'Opening with `"w"` (C++: `ofstream`) empties the file first, whether it existed or not. So every run starts from an empty out.txt and writes the full answer again — out.txt always shows the LAST run only. That is also why an old wrong answer disappears as soon as you run the fixed program.\n*Mở bằng `"w"` (C++: `ofstream`) sẽ làm trống tệp trước, dù tệp đã có hay chưa. Vì vậy mỗi lần chạy đều bắt đầu từ out.txt trống và ghi lại toàn bộ kết quả — out.txt luôn chỉ chứa lần chạy CUỐI. Đó cũng là lý do kết quả sai cũ biến mất ngay khi bạn chạy chương trình đã sửa.*',
      weight: 2,
    },

    // --- Section 5: the function that sets the order ---
    {
      type: "single_select",
      title: "A9. Sorting twice",
      content: `What does out.txt contain? (Lines separated by commas.)
*out.txt chứa gì? (Các dòng cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
def highest_first(score):
    return -score

scores = [60, 95, 78]
scores.sort(key=highest_first)
scores.sort()

with open("out.txt", "w") as f:
    for s in scores:
        f.write(str(s) + "\\n")
\`\`\`
C++:
\`\`\`
bool highestFirst(int a, int b) {
    return a > b;
}

vector<int> scores = {60, 95, 78};
sort(scores.begin(), scores.end(), highestFirst);
sort(scores.begin(), scores.end());

ofstream fout("out.txt");
for (int x : scores) {
    fout << x << endl;
}
\`\`\``,
      options: [
        { text: "60, 78, 95", isCorrect: true },
        { text: "95, 78, 60", isCorrect: false },
        { text: "60, 95, 78", isCorrect: false },
        {
          text: "Error — a list can only be sorted once / Lỗi — một list chỉ được sắp xếp một lần",
          isCorrect: false,
        },
      ],
      explanation:
        "Each sort rearranges the list from wherever it is now and knows nothing about earlier sorts. The first sort makes it 95, 78, 60; the second sort, with no function, puts the smallest first again. The order in out.txt always comes from the LAST sort that ran.\n*Mỗi lần sort sắp xếp lại list từ trạng thái hiện tại và không biết gì về các lần sort trước. Lần sort đầu làm list thành 95, 78, 60; lần sort thứ hai, không có hàm, lại xếp nhỏ trước. Thứ tự trong out.txt luôn do lần sort CUỐI CÙNG quyết định.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A10. Closest to 75 first",
      content: `What does out.txt contain? (Lines separated by commas.)
*out.txt chứa gì? (Các dòng cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
def distance_from_75(score):
    if score > 75:
        return score - 75
    return 75 - score

scores = [60, 80, 74, 95]
scores.sort(key=distance_from_75)

with open("out.txt", "w") as f:
    for s in scores:
        f.write(str(s) + "\\n")
\`\`\`
C++:
\`\`\`
int distanceFrom75(int score) {
    if (score > 75) {
        return score - 75;
    }
    return 75 - score;
}

bool closestTo75(int a, int b) {
    return distanceFrom75(a) < distanceFrom75(b);
}

vector<int> scores = {60, 80, 74, 95};
sort(scores.begin(), scores.end(), closestTo75);

ofstream fout("out.txt");
for (int x : scores) {
    fout << x << endl;
}
\`\`\``,
      options: [
        { text: "60, 74, 80, 95", isCorrect: false },
        { text: "95, 80, 74, 60", isCorrect: false },
        { text: "74, 80, 60, 95", isCorrect: true },
        { text: "1, 5, 15, 20", isCorrect: false },
      ],
      explanation:
        "sort orders by the distance from 75: 60 → 15, 80 → 5, 74 → 1, 95 → 20. Smallest distance first gives 74, 80, 60, 95. The distances are only used for comparing — out.txt still holds the scores, so 1, 5, 15, 20 never appear.\n*sort xếp theo khoảng cách tới 75: 60 → 15, 80 → 5, 74 → 1, 95 → 20. Khoảng cách nhỏ trước cho ra 74, 80, 60, 95. Khoảng cách chỉ dùng để so sánh — out.txt vẫn chứa điểm, nên 1, 5, 15, 20 không bao giờ xuất hiện.*",
      weight: 2,
    },

    // --- Section 6: a name and a score on each line ---
    {
      type: "single_select",
      title: "A11. Position 1 in two lists",
      content: `What does this print?
*Đoạn này in ra gì?*

**students.txt:**
\`\`\`
An 87
Binh 92
Chi 78
\`\`\`
Python:
\`\`\`
names = []
scores = []
with open("students.txt") as f:
    for line in f:
        name, score = line.split()
        names.append(name)
        scores.append(int(score))
print(names[1], scores[1])
\`\`\`
C++:
\`\`\`
ifstream fin("students.txt");
vector<string> names;
vector<int> scores;
string name;
int score;
while (fin >> name >> score) {
    names.push_back(name);
    scores.push_back(score);
}
cout << names[1] << " " << scores[1] << endl;
\`\`\``,
      options: [
        { text: "An 87", isCorrect: false },
        { text: "Binh 87", isCorrect: false },
        { text: "An 92", isCorrect: false },
        { text: "Binh 92", isCorrect: true },
      ],
      explanation:
        "Positions count from 0, so position 1 is the SECOND student. names and scores each got one item per pass, in the same pass, so position 1 in both lists came from the same line: Binh 92. An 87 is position 0.\n*Vị trí đếm từ 0, nên vị trí 1 là học sinh THỨ HAI. names và scores mỗi lượt đều được thêm một phần tử, trong cùng một lượt, nên vị trí 1 ở cả hai list đến từ cùng một dòng: Binh 92. An 87 là vị trí 0.*",
      weight: 2,
    },

    // --- Section 7: keep the name and the score together ---
    {
      type: "single_select",
      title: "A12. Sorting only the scores",
      content: `What does out.txt contain? (Lines separated by commas.)
*out.txt chứa gì? (Các dòng cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
names = ["An", "Binh", "Chi"]
scores = [87, 92, 78]

scores.sort()

with open("out.txt", "w") as f:
    for i in range(len(names)):
        f.write(names[i] + " " + str(scores[i]) + "\\n")
\`\`\`
C++:
\`\`\`
vector<string> names = {"An", "Binh", "Chi"};
vector<int> scores = {87, 92, 78};

sort(scores.begin(), scores.end());

ofstream fout("out.txt");
for (int i = 0; i < names.size(); i++) {
    fout << names[i] << " " << scores[i] << endl;
}
\`\`\``,
      options: [
        { text: "Chi 78, An 87, Binh 92", isCorrect: false },
        { text: "An 78, Binh 87, Chi 92", isCorrect: true },
        { text: "An 87, Binh 92, Chi 78", isCorrect: false },
        {
          text: "Error: the two lists no longer match / Lỗi: hai list không còn khớp nhau",
          isCorrect: false,
        },
      ],
      explanation:
        "sort moved only the scores; names stayed in file order. Position 0 now holds An and 78 — which is Chi's score. Every student gets someone else's score, there is no error, and the scores even look sorted. That is why the name and the score must travel together as one tuple (C++: pair) — then sort moves them as one piece.\n*sort chỉ di chuyển điểm; names vẫn theo thứ tự trong tệp. Vị trí 0 giờ là An và 78 — mà đó là điểm của Chi. Học sinh nào cũng nhận điểm của người khác, không có lỗi, và điểm trông còn như đã sắp xếp. Vì vậy tên và điểm phải đi cùng nhau thành một tuple (C++: pair) — khi đó sort di chuyển chúng như một khối.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A13. The second part of a record",
      content: `What does this print?
*Đoạn này in ra gì?*

Python:
\`\`\`
student = ("Cong", 53)
print(student[1] + 5)
\`\`\`
C++:
\`\`\`
pair<string, int> student = {"Cong", 53};
cout << student.second + 5 << endl;
\`\`\``,
      options: [
        { text: "58", isCorrect: true },
        {
          text: "Error — you cannot add 5 to a name / Lỗi — không cộng 5 vào tên được",
          isCorrect: false,
        },
        { text: "53", isCorrect: false },
        { text: "Cong 58", isCorrect: false },
      ],
      explanation:
        'Python: a tuple counts its parts from 0, so student[0] is "Cong" and student[1] is 53. C++: .first is "Cong" and .second is 53. So the result is 53 + 5 = 58. The error option is what happens with student[0] (C++: .first) — trying to add 5 to a name.\n*Python: tuple đánh số các phần từ 0, nên student[0] là "Cong" và student[1] là 53. C++: .first là "Cong" và .second là 53. Vậy kết quả là 53 + 5 = 58. Đáp án lỗi là chuyện xảy ra với student[0] (C++: .first) — cố cộng 5 vào một cái tên.*',
      weight: 2,
    },
    {
      type: "single_select",
      title: "A14. The first record after sorting",
      content: `What does this print?
*Đoạn này in ra gì?*

Python:
\`\`\`
def by_score(student):
    return student[1]

data = [("An", 87), ("Binh", 92), ("Chi", 78)]
data.sort(key=by_score)
print(data[0][0])
\`\`\`
C++:
\`\`\`
bool lowestScoreFirst(pair<string, int> a, pair<string, int> b) {
    return a.second < b.second;
}

vector<pair<string, int>> data = {{"An", 87}, {"Binh", 92}, {"Chi", 78}};
sort(data.begin(), data.end(), lowestScoreFirst);
cout << data[0].first << endl;
\`\`\``,
      options: [
        { text: "An", isCorrect: false },
        { text: "78", isCorrect: false },
        { text: "Chi", isCorrect: true },
        { text: "Binh", isCorrect: false },
      ],
      explanation:
        'After sorting by score, data[0] is the whole record with the lowest score: ("Chi", 78). The second [0] (C++: .first) takes the name out of that record. Because each record moved as one piece, the name that comes out really belongs to 78. An is only first in the FILE.\n*Sau khi sắp theo điểm, data[0] là cả bản ghi có điểm thấp nhất: ("Chi", 78). Dấu [0] thứ hai (C++: .first) lấy tên ra khỏi bản ghi đó. Vì mỗi bản ghi di chuyển như một khối, tên lấy ra đúng là của điểm 78. An chỉ đứng đầu trong TỆP.*',
      weight: 2,
    },
    {
      type: "single_select",
      title: "A15. Sorting by the name",
      content: `What does out.txt contain? (Lines separated by commas.)
*out.txt chứa gì? (Các dòng cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
def order(student):
    return student[0]

data = [("Binh", 92), ("Chi", 78), ("An", 87)]
data.sort(key=order)

with open("out.txt", "w") as f:
    for name, score in data:
        f.write(name + " " + str(score) + "\\n")
\`\`\`
C++:
\`\`\`
bool order(pair<string, int> a, pair<string, int> b) {
    return a.first < b.first;
}

vector<pair<string, int>> data = {{"Binh", 92}, {"Chi", 78}, {"An", 87}};
sort(data.begin(), data.end(), order);

ofstream fout("out.txt");
for (auto& p : data) {
    fout << p.first << " " << p.second << endl;
}
\`\`\``,
      options: [
        { text: "Chi 78, An 87, Binh 92", isCorrect: false },
        { text: "Binh 92, An 87, Chi 78", isCorrect: false },
        {
          text: "Error — sort can only compare numbers / Lỗi — sort chỉ so sánh được số",
          isCorrect: false,
        },
        { text: "An 87, Binh 92, Chi 78", isCorrect: true },
      ],
      explanation:
        "The function gives back the name (C++: compares .first), so sort compares names — and names compare in A–Z order. sort can compare text as well as numbers. Each score still travels with its own name.\n*Hàm trả về tên (C++: so sánh .first), nên sort so sánh các tên — và tên được so sánh theo thứ tự A–Z. sort so sánh được cả chữ lẫn số. Mỗi điểm vẫn đi cùng tên của nó.*",
      weight: 2,
    },

    // --- Section 8: what changed ---
    {
      type: "single_select",
      title: "A16. Highest first instead",
      content: `This program writes the students into out.txt from the LOWEST score to the highest. Now the HIGHEST score must come first. What is the SMALLEST change?
*Chương trình này ghi học sinh vào out.txt từ điểm THẤP nhất đến cao nhất. Giờ điểm CAO nhất phải đứng trước. Thay đổi NHỎ NHẤT là gì?*

Python:
\`\`\`
def by_score(student):
    return student[1]

data = [("An", 87), ("Binh", 92), ("Chi", 78)]
data.sort(key=by_score)

with open("out.txt", "w") as f:
    for name, score in data:
        f.write(name + " " + str(score) + "\\n")
\`\`\`
C++:
\`\`\`
bool lowestScoreFirst(pair<string, int> a, pair<string, int> b) {
    return a.second < b.second;
}

vector<pair<string, int>> data = {{"An", 87}, {"Binh", 92}, {"Chi", 78}};
sort(data.begin(), data.end(), lowestScoreFirst);

ofstream fout("out.txt");
for (auto& p : data) {
    fout << p.first << " " << p.second << endl;
}
\`\`\``,
      options: [
        {
          text: 'Write data in the opposite order: ("Chi", 78), ("Binh", 92), ("An", 87) / Viết data theo thứ tự ngược: ("Chi", 78), ("Binh", 92), ("An", 87)',
          isCorrect: false,
        },
        {
          text: "Change only the function: give back -student[1] instead of student[1] (C++: a.second > b.second instead of <) / Chỉ đổi hàm: trả về -student[1] thay vì student[1] (C++: a.second > b.second thay vì <)",
          isCorrect: true,
        },
        {
          text: "Swap the name and the score inside every tuple (C++: pair) / Đổi chỗ tên và điểm trong mọi tuple (C++: pair)",
          isCorrect: false,
        },
        {
          text: "It cannot be done without rewriting the whole program / Không làm được nếu không viết lại cả chương trình",
          isCorrect: false,
        },
      ],
      explanation:
        "Reading, storing and writing do not care about the order — only the function decides it. So a new order is a change to that one small function, and the rest of the program stays exactly the same. Writing data in the opposite order only changes where the list STARTS — sort rearranges it anyway, so the result is the same.\n*Đọc, lưu và ghi không quan tâm thứ tự — chỉ có hàm quyết định thứ tự. Vì vậy muốn thứ tự mới thì chỉ sửa một hàm nhỏ đó, phần còn lại của chương trình giữ nguyên. Viết data theo thứ tự ngược chỉ đổi thứ tự BAN ĐẦU của list — sort vẫn sắp xếp lại, nên kết quả không đổi.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A17. Sorting by the length of the name",
      content: `What does out.txt contain? (Lines separated by commas.)
*out.txt chứa gì? (Các dòng cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
def name_length(student):
    return len(student[0])

data = [("Binh", 92), ("An", 87), ("Chi", 78)]
data.sort(key=name_length)

with open("out.txt", "w") as f:
    for name, score in data:
        f.write(name + " " + str(score) + "\\n")
\`\`\`
C++:
\`\`\`
bool shorterName(pair<string, int> a, pair<string, int> b) {
    return a.first.size() < b.first.size();
}

vector<pair<string, int>> data = {{"Binh", 92}, {"An", 87}, {"Chi", 78}};
sort(data.begin(), data.end(), shorterName);

ofstream fout("out.txt");
for (auto& p : data) {
    fout << p.first << " " << p.second << endl;
}
\`\`\``,
      options: [
        { text: "Chi 78, An 87, Binh 92", isCorrect: false },
        { text: "An 87, Binh 92, Chi 78", isCorrect: false },
        { text: "An 87, Chi 78, Binh 92", isCorrect: true },
        { text: "Binh 92, An 87, Chi 78", isCorrect: false },
      ],
      explanation:
        "The function gives back the LENGTH of the name: An → 2, Chi → 3, Binh → 4. So sort puts the shortest name first. The sort line is the same one as always — the function alone decides the order. Each score still travels with its own name, and the lengths are only used for comparing.\n*Hàm trả về ĐỘ DÀI của tên: An → 2, Chi → 3, Binh → 4. Vì vậy sort xếp tên ngắn nhất trước. Dòng sort vẫn như mọi khi — chỉ riêng hàm quyết định thứ tự. Mỗi điểm vẫn đi cùng tên của nó, và độ dài chỉ dùng để so sánh.*",
      weight: 2,
    },

    // --- Section 9: exercises ---
    {
      type: "single_select",
      title: "A18. The lowest score, starting from 0",
      content: `What does this print?
*Đoạn này in ra gì?*

Python:
\`\`\`
scores = [60, 95, 78]

lowest = 0
for s in scores:
    if s < lowest:
        lowest = s
print(lowest)
\`\`\`
C++:
\`\`\`
vector<int> scores = {60, 95, 78};

int lowest = 0;
for (int x : scores) {
    if (x < lowest) {
        lowest = x;
    }
}
cout << lowest << endl;
\`\`\``,
      options: [
        { text: "0", isCorrect: true },
        { text: "60", isCorrect: false },
        { text: "95", isCorrect: false },
        { text: "78", isCorrect: false },
      ],
      explanation:
        "No score is smaller than 0, so the if is never true and lowest stays 0 — a score nobody got. Start from a real score instead: lowest = scores[0]. (Starting from 0 happens to work for the HIGHEST score, because every score is bigger than 0.)\n*Không điểm nào nhỏ hơn 0, nên câu if không bao giờ đúng và lowest vẫn là 0 — một điểm không ai có. Hãy bắt đầu từ một điểm thật: lowest = scores[0]. (Bắt đầu từ 0 tình cờ vẫn đúng khi tìm điểm CAO NHẤT, vì mọi điểm đều lớn hơn 0.)*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A19. The three lowest",
      content: `The student wants the three LOWEST scores. What does out.txt contain? (Lines separated by commas.)
*Học sinh muốn ba điểm THẤP NHẤT. out.txt chứa gì? (Các dòng cách nhau bởi dấu phẩy.)*

Python:
\`\`\`
scores = [70, 40, 90, 55, 62]
scores.sort()

with open("out.txt", "w") as f:
    for i in range(1, 4):
        f.write(str(scores[i]) + "\\n")
\`\`\`
C++:
\`\`\`
vector<int> scores = {70, 40, 90, 55, 62};
sort(scores.begin(), scores.end());

ofstream fout("out.txt");
for (int i = 1; i < 4; i++) {
    fout << scores[i] << endl;
}
\`\`\``,
      options: [
        { text: "40, 55, 62", isCorrect: false },
        { text: "40, 90, 55", isCorrect: false },
        { text: "40, 55, 62, 70", isCorrect: false },
        { text: "55, 62, 70", isCorrect: true },
      ],
      explanation:
        "After sort the list is 40, 55, 62, 70, 90. range(1, 4) gives positions 1, 2, 3 (C++: i = 1, 2, 3) — it skips position 0, the lowest score, and takes the fourth one instead. Positions start at 0: the three lowest are positions 0, 1, 2, which is range(3) (C++: i = 0; i < 3).\n*Sau sort list là 40, 55, 62, 70, 90. range(1, 4) cho vị trí 1, 2, 3 (C++: i = 1, 2, 3) — nó bỏ qua vị trí 0, điểm thấp nhất, và lấy điểm thứ tư thay vào. Vị trí bắt đầu từ 0: ba điểm thấp nhất là vị trí 0, 1, 2, tức là range(3) (C++: i = 0; i < 3).*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A20. The place number",
      content: `What is the FIRST line of out.txt?
*Dòng ĐẦU TIÊN của out.txt là gì?*

Python:
\`\`\`
data = [("Khai", 95), ("Loan", 90), ("Hai", 67)]

with open("out.txt", "w") as f:
    for i in range(3):
        name, score = data[i]
        f.write(str(i) + " " + name + " " + str(score) + "\\n")
\`\`\`
C++:
\`\`\`
vector<pair<string, int>> data = {{"Khai", 95}, {"Loan", 90}, {"Hai", 67}};

ofstream fout("out.txt");
for (int i = 0; i < 3; i++) {
    fout << i << " " << data[i].first << " " << data[i].second << endl;
}
\`\`\``,
      options: [
        { text: "1 Khai 95", isCorrect: false },
        { text: "0 Khai 95", isCorrect: true },
        { text: "1 Loan 90", isCorrect: false },
        { text: "0 Hai 67", isCorrect: false },
      ],
      explanation:
        "i counts positions, and positions start at 0 — so the best student is written with 0. A place for people starts at 1, so write i + 1. The students are in the right order; only the number in front is one too small.\n*i đếm vị trí, và vị trí bắt đầu từ 0 — nên học sinh giỏi nhất được ghi kèm số 0. Thứ hạng của người thì bắt đầu từ 1, nên hãy ghi i + 1. Các học sinh đúng thứ tự; chỉ con số phía trước nhỏ hơn một.*",
      weight: 2,
    },

    // ==================== PART B — FILE INPUT / OUTPUT ====================
    // Same pattern every time: read the file → (process) → write the answer file.
    // B1–B7 easy (weight 4), B8–B10 medium (weight 6). Answer in Python OR C++.

    {
      type: "free_text",
      title: "B1. Late Penalty",
      content: `\`scores.txt\` has one score per line. Every score loses 10 points, but a score can never go below 0. Write each new score into \`out.txt\`, one per line, in the same order as the file.
*\`scores.txt\` có mỗi dòng một điểm. Mỗi điểm bị trừ 10, nhưng điểm không bao giờ được nhỏ hơn 0. Ghi từng điểm mới vào \`out.txt\`, mỗi dòng một điểm, đúng thứ tự trong tệp.*

**Example scores.txt:**
\`\`\`
87
5
60
10
\`\`\`

**out.txt should be:**
\`\`\`
77
0
50
0
\`\`\``,
      referenceAnswer: `# Python
scores = []

with open("scores.txt") as f:
    for line in f:
        scores.append(int(line))

with open("out.txt", "w") as f:
    for s in scores:
        new_score = s - 10
        if new_score < 0:
            new_score = 0
        f.write(str(new_score) + "\\n")

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
        int newScore = x - 10;
        if (newScore < 0) {
            newScore = 0;
        }
        fout << newScore << endl;
    }

    return 0;
}`,
      explanation: `Read → change each value → write. Subtract first, then an if turns anything below 0 into 0. 10 - 10 = 0 is fine; only values under 0 change.
*Đọc → đổi từng giá trị → ghi. Trừ trước, rồi câu if đổi mọi giá trị dưới 0 thành 0. 10 - 10 = 0 vẫn giữ; chỉ giá trị dưới 0 mới đổi.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B2. The Three Lowest",
      content: `\`scores.txt\` has at least 3 scores, one per line. Write the three lowest scores into \`out.txt\`, one per line, lowest first.
*\`scores.txt\` có ít nhất 3 điểm, mỗi dòng một điểm. Ghi ba điểm thấp nhất vào \`out.txt\`, mỗi dòng một điểm, thấp nhất trước.*

**Example scores.txt:**
\`\`\`
78
95
60
87
41
\`\`\`

**out.txt should be:**
\`\`\`
41
60
78
\`\`\``,
      referenceAnswer: `# Python
scores = []

with open("scores.txt") as f:
    for line in f:
        scores.append(int(line))

scores.sort()

with open("out.txt", "w") as f:
    for i in range(3):
        f.write(str(scores[i]) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
#include <algorithm>
using namespace std;

int main() {
    ifstream fin("scores.txt");
    ofstream fout("out.txt");
    vector<int> scores;

    int s;
    while (fin >> s) {
        scores.push_back(s);
    }

    sort(scores.begin(), scores.end());

    for (int i = 0; i < 3; i++) {
        fout << scores[i] << endl;
    }

    return 0;
}`,
      explanation: `Sort smallest first; the three lowest are then positions 0, 1, 2 — range(3) (C++: i = 0; i < 3). Starting at 1 would skip the lowest score.
*Sắp xếp nhỏ trước; khi đó ba điểm thấp nhất là vị trí 0, 1, 2 — range(3) (C++: i = 0; i < 3). Bắt đầu từ 1 sẽ bỏ mất điểm thấp nhất.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B3. Pass and Fail Count",
      content: `\`scores.txt\` has one score per line. A score of 50 or more passes. Write two lines into \`out.txt\`: the first line is how many scores passed, the second line is how many failed.
*\`scores.txt\` có mỗi dòng một điểm. Điểm từ 50 trở lên là đạt. Ghi hai dòng vào \`out.txt\`: dòng đầu là số điểm đạt, dòng thứ hai là số điểm không đạt.*

**Example scores.txt:**
\`\`\`
49
50
91
12
77
\`\`\`

**out.txt should be:**
\`\`\`
3
2
\`\`\``,
      referenceAnswer: `# Python
scores = []

with open("scores.txt") as f:
    for line in f:
        scores.append(int(line))

passed = 0
failed = 0
for s in scores:
    if s >= 50:
        passed = passed + 1
    else:
        failed = failed + 1

with open("out.txt", "w") as f:
    f.write(str(passed) + "\\n")
    f.write(str(failed) + "\\n")

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

    int passed = 0;
    int failed = 0;
    for (int x : scores) {
        if (x >= 50) {
            passed = passed + 1;
        } else {
            failed = failed + 1;
        }
    }

    fout << passed << endl;
    fout << failed << endl;

    return 0;
}`,
      explanation: `Two counters, both set to 0 BEFORE the loop. An if/else puts every score in exactly one group; >= 50 passes, so 50 counts as a pass.
*Hai biến đếm, cả hai gán 0 TRƯỚC vòng lặp. if/else đưa mỗi điểm vào đúng một nhóm; >= 50 là đạt, nên 50 được tính là đạt.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B4. Passing Scores, Highest First",
      content: `\`scores.txt\` has one score per line. Write only the scores of 50 or more into \`out.txt\`, one per line, from the highest to the lowest. Use a function to tell sort the order.
*\`scores.txt\` có mỗi dòng một điểm. Chỉ ghi những điểm từ 50 trở lên vào \`out.txt\`, mỗi dòng một điểm, từ cao nhất đến thấp nhất. Dùng một hàm để nói cho sort biết thứ tự.*

**Example scores.txt:**
\`\`\`
45
88
50
97
12
63
\`\`\`

**out.txt should be:**
\`\`\`
97
88
63
50
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
        if s >= 50:
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
        if (x >= 50) {
            fout << x << endl;
        }
    }

    return 0;
}`,
      explanation: `Read → sort with the function → write only the scores that pass. The if can sit in the writing loop; sorting the failing scores too does no harm.
*Đọc → sắp xếp bằng hàm → chỉ ghi những điểm đạt. Câu if có thể nằm trong vòng lặp ghi; sắp xếp cả điểm không đạt cũng không sao.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B5. Pass or Fail",
      content: `\`students.txt\` has a name and a score on each line. For every student, write one line into \`out.txt\`: the name, a space, then \`pass\` if the score is 50 or more, otherwise \`fail\`. Keep the same order as the file.
*\`students.txt\` mỗi dòng có một tên và một điểm. Với mỗi học sinh, ghi một dòng vào \`out.txt\`: tên, một dấu cách, rồi \`pass\` nếu điểm từ 50 trở lên, ngược lại là \`fail\`. Giữ đúng thứ tự trong tệp.*

**Example students.txt:**
\`\`\`
Tuyet 60
Cong 49
Hai 50
\`\`\`

**out.txt should be:**
\`\`\`
Tuyet pass
Cong fail
Hai pass
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
        if scores[i] >= 50:
            f.write(names[i] + " pass\\n")
        else:
            f.write(names[i] + " fail\\n")

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
        if (scores[i] >= 50) {
            fout << names[i] << " pass" << endl;
        } else {
            fout << names[i] << " fail" << endl;
        }
    }

    return 0;
}`,
      explanation: `Each line is read as two things, and names[i] and scores[i] belong to the same student. Python: int(score) matters — the text "60" cannot be compared with 50. Tuples work here too.
*Mỗi dòng được đọc thành hai thứ, và names[i] với scores[i] thuộc cùng một học sinh. Python: int(score) là cần thiết — chữ "60" không so sánh được với 50. Dùng tuple cũng được.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B6. Lowest First, With Names",
      content: `\`students.txt\` has a name and a score on each line. No two students have the same score. Write every student into \`out.txt\`, name then score, from the lowest score to the highest.
*\`students.txt\` mỗi dòng có một tên và một điểm. Không có hai học sinh nào cùng điểm. Ghi mọi học sinh vào \`out.txt\`, tên rồi đến điểm, từ điểm thấp nhất đến cao nhất.*

**Example students.txt:**
\`\`\`
An 87
Binh 92
Chi 78
Dung 65
\`\`\`

**out.txt should be:**
\`\`\`
Dung 65
Chi 78
An 87
Binh 92
\`\`\``,
      referenceAnswer: `# Python
def by_score(student):
    return student[1]

data = []

with open("students.txt") as f:
    for line in f:
        name, score = line.split()
        data.append((name, int(score)))

data.sort(key=by_score)

with open("out.txt", "w") as f:
    for name, score in data:
        f.write(name + " " + str(score) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <algorithm>
using namespace std;

bool lowestScoreFirst(pair<string, int> a, pair<string, int> b) {
    return a.second < b.second;
}

int main() {
    ifstream fin("students.txt");
    ofstream fout("out.txt");
    vector<pair<string, int>> data;

    string name;
    int score;
    while (fin >> name >> score) {
        data.push_back({name, score});
    }

    sort(data.begin(), data.end(), lowestScoreFirst);

    for (auto& p : data) {
        fout << p.first << " " << p.second << endl;
    }

    return 0;
}`,
      explanation: `Keep each name and score together as one tuple (C++: pair), then sort with a function that picks the score (C++: compares .second). Sorting only a list of scores would give every name the wrong score.
*Giữ tên và điểm cùng nhau thành một tuple (C++: pair), rồi sắp xếp bằng hàm lấy ra điểm (C++: so sánh .second). Chỉ sắp xếp list điểm sẽ làm tên nào cũng nhận sai điểm.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B7. Highest First, With Names",
      content: `\`students.txt\` has a name and a score on each line. No two students have the same score. Write every student into \`out.txt\`, name then score, from the highest score to the lowest.
*\`students.txt\` mỗi dòng có một tên và một điểm. Không có hai học sinh nào cùng điểm. Ghi mọi học sinh vào \`out.txt\`, tên rồi đến điểm, từ điểm cao nhất đến thấp nhất.*

**Example students.txt:**
\`\`\`
Tuyet 60
Cong 53
Hai 67
Loan 90
\`\`\`

**out.txt should be:**
\`\`\`
Loan 90
Hai 67
Tuyet 60
Cong 53
\`\`\``,
      referenceAnswer: `# Python
def highest_first(student):
    return -student[1]

data = []

with open("students.txt") as f:
    for line in f:
        name, score = line.split()
        data.append((name, int(score)))

data.sort(key=highest_first)

with open("out.txt", "w") as f:
    for name, score in data:
        f.write(name + " " + str(score) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <algorithm>
using namespace std;

bool highestFirst(pair<string, int> a, pair<string, int> b) {
    return a.second > b.second;
}

int main() {
    ifstream fin("students.txt");
    ofstream fout("out.txt");
    vector<pair<string, int>> data;

    string name;
    int score;
    while (fin >> name >> score) {
        data.push_back({name, score});
    }

    sort(data.begin(), data.end(), highestFirst);

    for (auto& p : data) {
        fout << p.first << " " << p.second << endl;
    }

    return 0;
}`,
      explanation: `The same program as B6 — only the function changes: -student[1] (C++: a.second > b.second).
*Cùng chương trình với B6 — chỉ đổi hàm: -student[1] (C++: a.second > b.second).*`,
      weight: 4,
    },

    // --- Medium (weight 6) ---
    {
      type: "free_text",
      title: "B8. Top Three With Places",
      content: `\`students.txt\` has a name and a score on each line: at least 3 students, and no two with the same score. Write the three best students into \`out.txt\`, best first. Each line starts with the place (\`1\`, \`2\`, \`3\`), then the name and the score.
*\`students.txt\` mỗi dòng có một tên và một điểm: ít nhất 3 học sinh, và không có hai bạn nào cùng điểm. Ghi ba học sinh giỏi nhất vào \`out.txt\`, bạn giỏi nhất trước. Mỗi dòng bắt đầu bằng thứ hạng (\`1\`, \`2\`, \`3\`), rồi đến tên và điểm.*

**Example students.txt:**
\`\`\`
An 87
Binh 92
Chi 78
Dung 65
Em 99
\`\`\`

**out.txt should be:**
\`\`\`
1 Em 99
2 Binh 92
3 An 87
\`\`\``,
      referenceAnswer: `# Python
def highest_first(student):
    return -student[1]

data = []

with open("students.txt") as f:
    for line in f:
        name, score = line.split()
        data.append((name, int(score)))

data.sort(key=highest_first)

with open("out.txt", "w") as f:
    for i in range(3):
        name, score = data[i]
        f.write(str(i + 1) + " " + name + " " + str(score) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <algorithm>
using namespace std;

bool highestFirst(pair<string, int> a, pair<string, int> b) {
    return a.second > b.second;
}

int main() {
    ifstream fin("students.txt");
    ofstream fout("out.txt");
    vector<pair<string, int>> data;

    string name;
    int score;
    while (fin >> name >> score) {
        data.push_back({name, score});
    }

    sort(data.begin(), data.end(), highestFirst);

    for (int i = 0; i < 3; i++) {
        fout << i + 1 << " " << data[i].first << " " << data[i].second << endl;
    }

    return 0;
}`,
      explanation: `Sort highest first, then write positions 0, 1, 2. The place is i + 1: positions start at 0, but places start at 1.
*Sắp xếp cao trước, rồi ghi vị trí 0, 1, 2. Thứ hạng là i + 1: vị trí bắt đầu từ 0, còn thứ hạng bắt đầu từ 1.*`,
      weight: 6,
    },
    {
      type: "free_text",
      title: "B9. Closest to 75",
      content: `\`students.txt\` has a name and a score on each line. Write every student into \`out.txt\`, name then score, starting with the student whose score is closest to 75 and ending with the one furthest from it. No two students are the same distance from 75.
*\`students.txt\` mỗi dòng có một tên và một điểm. Ghi mọi học sinh vào \`out.txt\`, tên rồi đến điểm, bắt đầu từ bạn có điểm gần 75 nhất và kết thúc ở bạn xa 75 nhất. Không có hai bạn nào cách 75 bằng nhau.*

**Example students.txt:**
\`\`\`
An 87
Binh 70
Chi 76
Dung 50
\`\`\`

**out.txt should be:**
\`\`\`
Chi 76
Binh 70
An 87
Dung 50
\`\`\``,
      referenceAnswer: `# Python
def distance_from_75(student):
    if student[1] > 75:
        return student[1] - 75
    return 75 - student[1]

data = []

with open("students.txt") as f:
    for line in f:
        name, score = line.split()
        data.append((name, int(score)))

data.sort(key=distance_from_75)

with open("out.txt", "w") as f:
    for name, score in data:
        f.write(name + " " + str(score) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <algorithm>
using namespace std;

int distanceFrom75(int score) {
    if (score > 75) {
        return score - 75;
    }
    return 75 - score;
}

bool closestTo75(pair<string, int> a, pair<string, int> b) {
    return distanceFrom75(a.second) < distanceFrom75(b.second);
}

int main() {
    ifstream fin("students.txt");
    ofstream fout("out.txt");
    vector<pair<string, int>> data;

    string name;
    int score;
    while (fin >> name >> score) {
        data.push_back({name, score});
    }

    sort(data.begin(), data.end(), closestTo75);

    for (auto& p : data) {
        fout << p.first << " " << p.second << endl;
    }

    return 0;
}`,
      explanation: `The function decides what sort compares: how far each score is from 75, above or below. 76 is 1 away, 70 is 5, 87 is 12, 50 is 25. The distances are only compared — out.txt still holds the real scores.
*Hàm quyết định sort so sánh cái gì: mỗi điểm cách 75 bao xa, dù cao hơn hay thấp hơn. 76 cách 1, 70 cách 5, 87 cách 12, 50 cách 25. Khoảng cách chỉ dùng để so sánh — out.txt vẫn chứa điểm thật.*`,
      weight: 6,
    },
    {
      type: "free_text",
      title: "B10. Two Classes, One Ranking",
      content: `\`class-a.txt\` and \`class-b.txt\` each have a name and a score on each line. No two students have the same score. Write ALL students from both files into \`out.txt\`, name then score, from the highest score to the lowest.
*\`class-a.txt\` và \`class-b.txt\` mỗi dòng có một tên và một điểm. Không có hai học sinh nào cùng điểm. Ghi TẤT CẢ học sinh của cả hai tệp vào \`out.txt\`, tên rồi đến điểm, từ điểm cao nhất đến thấp nhất.*

**Example class-a.txt:**
\`\`\`
An 70
Binh 95
\`\`\`

**Example class-b.txt:**
\`\`\`
Chi 88
Dung 60
Em 99
\`\`\`

**out.txt should be:**
\`\`\`
Em 99
Binh 95
Chi 88
An 70
Dung 60
\`\`\``,
      referenceAnswer: `# Python
def highest_first(student):
    return -student[1]

data = []

with open("class-a.txt") as f:
    for line in f:
        name, score = line.split()
        data.append((name, int(score)))

with open("class-b.txt") as f:
    for line in f:
        name, score = line.split()
        data.append((name, int(score)))

data.sort(key=highest_first)

with open("out.txt", "w") as f:
    for name, score in data:
        f.write(name + " " + str(score) + "\\n")

// C++
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <algorithm>
using namespace std;

bool highestFirst(pair<string, int> a, pair<string, int> b) {
    return a.second > b.second;
}

int main() {
    ifstream finA("class-a.txt");
    ifstream finB("class-b.txt");
    ofstream fout("out.txt");
    vector<pair<string, int>> data;

    string name;
    int score;
    while (finA >> name >> score) {
        data.push_back({name, score});
    }
    while (finB >> name >> score) {
        data.push_back({name, score});
    }

    sort(data.begin(), data.end(), highestFirst);

    for (auto& p : data) {
        fout << p.first << " " << p.second << endl;
    }

    return 0;
}`,
      explanation: `Read BOTH files into the SAME list of tuples (C++: pairs), then sort once and write once. Each file needs its own reading loop, but both loops add to one list.
*Đọc CẢ HAI tệp vào CÙNG một list tuple (C++: pair), rồi sắp xếp một lần và ghi một lần. Mỗi tệp cần vòng lặp đọc riêng, nhưng cả hai vòng đều thêm vào một list.*`,
      weight: 6,
    },
  ],
};
