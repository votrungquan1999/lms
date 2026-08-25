/**
 * Fundamentals & Strings Review — 40 EASY questions, language-agnostic (bilingual EN/VN).
 *
 * Purpose: a confidence-building graded test after the hard July 90-min exam.
 * Scope: fundamentals review (variables, arithmetic, conditionals, loops, functions,
 * lists/arrays) + the new Data Structures & Strings material (string index/length,
 * reverse, uppercase, vowels, palindrome, linear search, dictionary/map lookup).
 *
 * Language-agnostic: every question works in Python OR C++. MC code-trace questions
 * show both snippets; coding problems are specified by input → output only and the
 * teacher-facing referenceAnswer carries a Python AND a C++ solution.
 *
 * Structure:
 *   Part A — 20 concept MC (single_select, weight 2 each) → 40% of grade
 *   Part B — 20 short coding problems (free_text, weight 3 each) → 60% of grade
 * Graded, untimed; reveal flags exam-safe (grade/answers hidden until released).
 * Suggested rubric per coding Q: correct logic 60 · exact output 25 · boundary 15.
 *
 * Seed (to the real DB from local, uses Atlas URI from .env.local):
 *   bun scripts/create-test.ts scripts/data/data-8-23-2026-easy-40-review.ts
 */
export default {
  courseId: "c98f8f96-916d-48e0-a67b-a161c2cf422c",
  test: {
    title: "Fundamentals & Strings Review — 40 Easy Questions (Python or C++)",
    description:
      "40 easy questions to review what you know. Part A: 20 multiple-choice concept questions (true/false answers are written as true/false; in Python they print as True/False). Part B: 20 short programs — answer in Python OR C++, your choice. Each program reads its input exactly as described and prints only the result (no prompt text). C++ answers may use cin/getline and cout.\n*40 câu hỏi dễ để ôn lại những gì bạn đã biết. Phần A: 20 câu trắc nghiệm khái niệm (đáp án đúng/sai viết là true/false; trong Python in ra là True/False). Phần B: 20 chương trình ngắn — trả lời bằng Python HOẶC C++, tùy bạn chọn. Mỗi chương trình đọc đầu vào đúng như mô tả và chỉ in ra kết quả (không in lời nhắc). C++ có thể dùng cin/getline và cout.*",
    showCorrectAnswerAfterSubmit: false,
    showGradeAfterSubmit: false,
  },
  questions: [
    // ==================== PART A — CONCEPT MC (weight 2 each) ====================
    // Each question targets ONE common misconception; every distractor is a real
    // student mistake, and the explanation states the rule (shown after release).

    // --- Variables & arithmetic ---
    {
      type: "single_select",
      title: "A1. Swapping without a temporary",
      content: `A student tries to swap two variables like this. What are \`a\` and \`b\` afterwards?
*Một học sinh cố hoán đổi hai biến như sau. Sau đó \`a\` và \`b\` bằng bao nhiêu?*
\`\`\`
a = 5
b = 7
a = b
b = a
\`\`\``,
      options: [
        { text: "a = 7, b = 7", isCorrect: true },
        { text: "a = 7, b = 5", isCorrect: false },
        { text: "a = 5, b = 7", isCorrect: false },
        { text: "a = 5, b = 5", isCorrect: false },
      ],
      explanation:
        "Assignment COPIES a value and overwrites the old one. After `a = b`, the 5 is gone, so `b = a` copies 7 back. A swap needs a third variable (`temp = a; a = b; b = temp`) or Python's `a, b = b, a`.\n*Phép gán SAO CHÉP giá trị và ghi đè giá trị cũ. Sau `a = b`, số 5 đã mất, nên `b = a` chép lại 7. Hoán đổi cần biến thứ ba (`temp = a; a = b; b = temp`) hoặc `a, b = b, a` trong Python.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A2. Integer division truncates",
      content:
        "What is `7 / 2` when both numbers are integers in C++ (the same as `7 // 2` in Python)?\n*`7 / 2` bằng bao nhiêu khi cả hai là số nguyên trong C++ (giống `7 // 2` trong Python)?*",
      options: [
        { text: "3", isCorrect: true },
        { text: "3.5", isCorrect: false },
        { text: "4", isCorrect: false },
        { text: "3.0", isCorrect: false },
      ],
      explanation:
        "Integer division drops the fractional part — it TRUNCATES, it does not round (3.5 becomes 3, not 4). To get 3.5, one operand must be a decimal: `7.0 / 2` in C++, or plain `7 / 2` in Python.\n*Chia nguyên bỏ phần thập phân — CẮT BỎ chứ không làm tròn (3.5 thành 3, không phải 4). Muốn có 3.5, một vế phải là số thực: `7.0 / 2` trong C++, hoặc `7 / 2` trong Python.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A3. Last digit and the rest",
      content:
        "What are `1234 % 10` and `1234 // 10` (C++: `1234 / 10` with integers)?\n*`1234 % 10` và `1234 // 10` (C++: `1234 / 10` với số nguyên) bằng bao nhiêu?*",
      options: [
        { text: "4 and 123", isCorrect: true },
        { text: "4 and 123.4", isCorrect: false },
        { text: "123 and 4", isCorrect: false },
        { text: "0.4 and 123", isCorrect: false },
      ],
      explanation:
        "`% 10` gives the LAST digit (the remainder), and integer division by 10 REMOVES the last digit. Repeating the pair is how you take a number apart digit by digit (digit sum, reverse a number).\n*`% 10` cho chữ số CUỐI (phần dư), còn chia nguyên cho 10 XÓA chữ số cuối. Lặp lại cặp này là cách tách một số thành từng chữ số (tổng chữ số, đảo ngược số).*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A4. Parentheses change the order",
      content:
        "What are `(2 + 3) * 4` and `2 + 3 * 4`?\n*`(2 + 3) * 4` và `2 + 3 * 4` bằng bao nhiêu?*",
      options: [
        { text: "20 and 14", isCorrect: true },
        { text: "14 and 14", isCorrect: false },
        { text: "20 and 20", isCorrect: false },
        { text: "14 and 20", isCorrect: false },
      ],
      explanation:
        "Multiplication runs before addition, so `2 + 3 * 4` is `2 + 12`. Code is NOT evaluated left to right; parentheses are the only way to force the addition first.\n*Phép nhân chạy trước phép cộng, nên `2 + 3 * 4` là `2 + 12`. Mã KHÔNG được tính từ trái sang phải; dấu ngoặc là cách duy nhất để buộc cộng trước.*",
      weight: 2,
    },

    // --- Conditionals ---
    {
      type: "single_select",
      title: "A5. elif chain vs separate ifs",
      content: `With \`x = 15\`, how many lines does EACH version print?
*Với \`x = 15\`, MỖI phiên bản in ra bao nhiêu dòng?*

Version 1 (Python / C++):
\`\`\`
if x > 5:          |  if (x > 5) cout << "A" << endl;
    print("A")     |  else if (x > 10) cout << "B" << endl;
elif x > 10:       |
    print("B")     |
\`\`\`
Version 2 (Python / C++):
\`\`\`
if x > 5:          |  if (x > 5) cout << "A" << endl;
    print("A")     |  if (x > 10) cout << "B" << endl;
if x > 10:         |
    print("B")     |
\`\`\``,
      options: [
        {
          text: "Version 1: 1 line, Version 2: 2 lines / Phiên bản 1: 1 dòng, phiên bản 2: 2 dòng",
          isCorrect: true,
        },
        {
          text: "Both print 2 lines / Cả hai in 2 dòng",
          isCorrect: false,
        },
        {
          text: "Both print 1 line / Cả hai in 1 dòng",
          isCorrect: false,
        },
        {
          text: "Version 1: 2 lines, Version 2: 1 line / Phiên bản 1: 2 dòng, phiên bản 2: 1 dòng",
          isCorrect: false,
        },
      ],
      explanation:
        "An `if / elif` (else if) chain STOPS at the first true branch — `x > 5` wins, so `B` is never checked. Two separate `if`s are independent and both run. Use a chain when the cases are exclusive.\n*Chuỗi `if / elif` (else if) DỪNG ở nhánh đúng đầu tiên — `x > 5` thắng, nên `B` không bao giờ được xét. Hai `if` riêng biệt độc lập với nhau và đều chạy. Dùng chuỗi khi các trường hợp loại trừ nhau.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A6. = instead of == in a condition",
      content:
        "A student writes `if x = 5` instead of `if x == 5`. What happens?\n*Một học sinh viết `if x = 5` thay vì `if x == 5`. Điều gì xảy ra?*",
      options: [
        {
          text: "Python: syntax error. C++: it ASSIGNS 5 to x and the condition is always true / Python: lỗi cú pháp. C++: nó GÁN 5 cho x và điều kiện luôn đúng",
          isCorrect: true,
        },
        {
          text: "Both languages compare x with 5 as intended / Cả hai ngôn ngữ so sánh x với 5 như mong muốn",
          isCorrect: false,
        },
        {
          text: "Both languages report a syntax error / Cả hai ngôn ngữ báo lỗi cú pháp",
          isCorrect: false,
        },
        {
          text: "Both languages skip the block / Cả hai ngôn ngữ bỏ qua khối lệnh",
          isCorrect: false,
        },
      ],
      explanation:
        "`=` assigns, `==` compares. Python refuses to run it, which is the safe outcome. C++ accepts it: `x = 5` stores 5 and the expression's value is 5 (non-zero = true), so the block ALWAYS runs — a silent bug that is hard to spot.\n*`=` gán, `==` so sánh. Python từ chối chạy, đó là kết quả an toàn. C++ chấp nhận: `x = 5` lưu 5 và giá trị biểu thức là 5 (khác 0 = đúng), nên khối lệnh LUÔN chạy — một lỗi âm thầm rất khó phát hiện.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: 'A7. The boundary of "50 or more"',
      content:
        'The rule is "Pass if the score is 50 or more", but the code says `if score > 50`. Which score is graded WRONG?\n*Quy tắc là "Đậu nếu điểm từ 50 trở lên", nhưng mã viết `if score > 50`. Điểm nào bị chấm SAI?*',
      options: [
        { text: "50", isCorrect: true },
        { text: "49", isCorrect: false },
        { text: "51", isCorrect: false },
        { text: "0", isCorrect: false },
      ],
      explanation:
        '"50 or more" includes 50, so the test must be `>=`. With `>`, exactly one score is misjudged: 50 itself becomes Fail. Always test your condition with the boundary value.\n*"Từ 50 trở lên" bao gồm 50, nên phải dùng `>=`. Với `>`, đúng một điểm bị xét sai: chính 50 thành Fail. Luôn thử điều kiện với giá trị ở biên.*',
      weight: 2,
    },
    {
      type: "single_select",
      title: 'A8. "Between 1 and 10" with or',
      content:
        'A student codes "x is between 1 and 10" as `x > 1 or x < 10` (C++: `x > 1 || x < 10`). For which values of x is this condition WRONG?\n*Một học sinh viết "x nằm giữa 1 và 10" là `x > 1 or x < 10` (C++: `x > 1 || x < 10`). Với giá trị x nào thì điều kiện này SAI?*',
      options: [
        {
          text: "Every x outside 1..10 — the condition is ALWAYS true / Mọi x ngoài 1..10 — điều kiện LUÔN đúng",
          isCorrect: true,
        },
        {
          text: "Only x = 1 and x = 10 / Chỉ x = 1 và x = 10",
          isCorrect: false,
        },
        {
          text: "Only negative numbers / Chỉ các số âm",
          isCorrect: false,
        },
        {
          text: "It is never wrong / Không bao giờ sai",
          isCorrect: false,
        },
      ],
      explanation:
        'Any number is either greater than 1 OR less than 10 (try 100: it is > 1; try -5: it is < 10), so `or` makes the condition true for everything. "Between" means BOTH limits hold at once: `x >= 1 and x <= 10`.\n*Bất kỳ số nào cũng hoặc lớn hơn 1 HOẶC nhỏ hơn 10 (thử 100: > 1; thử -5: < 10), nên `or` làm điều kiện đúng với mọi số. "Nằm giữa" nghĩa là CẢ HAI giới hạn cùng đúng: `x >= 1 and x <= 10`.*',
      weight: 2,
    },

    // --- Loops ---
    {
      type: "single_select",
      title: "A9. The loop variable after the loop",
      content: `After each loop finishes, what is the value of \`i\`?
*Sau khi mỗi vòng lặp kết thúc, giá trị của \`i\` là gì?*

Python:
\`\`\`
for i in range(5):
    pass
\`\`\`
C++:
\`\`\`
int i;
for (i = 0; i < 5; i++) {
}
\`\`\``,
      options: [
        { text: "Python: 4, C++: 5", isCorrect: true },
        { text: "4 in both / 4 ở cả hai", isCorrect: false },
        { text: "5 in both / 5 ở cả hai", isCorrect: false },
        { text: "0 in both / 0 ở cả hai", isCorrect: false },
      ],
      explanation:
        "Python's `for` hands `i` the values 0..4 and stops — `i` keeps the LAST value it was given, 4. C++ runs `i++` one more time and then tests `5 < 5`, which fails — so `i` ends at 5. Same loop, different leftover value.\n*`for` của Python đưa cho `i` các giá trị 0..4 rồi dừng — `i` giữ giá trị CUỐI nó nhận, là 4. C++ chạy `i++` thêm một lần rồi kiểm tra `5 < 5`, sai — nên `i` kết thúc ở 5. Cùng một vòng lặp, giá trị còn lại khác nhau.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A10. Starting the sum at 1",
      content: `This code should print 1 + 2 + ... + N, but \`total\` starts at 1 instead of 0. What does it print?
*Đoạn mã này phải in 1 + 2 + ... + N, nhưng \`total\` bắt đầu từ 1 thay vì 0. Nó in ra gì?*

Python:
\`\`\`
total = 1
for i in range(1, n + 1):
    total = total + i
print(total)
\`\`\`
C++:
\`\`\`
int total = 1;
for (int i = 1; i <= n; i++) {
    total = total + i;
}
cout << total;
\`\`\``,
      options: [
        {
          text: "The correct sum plus 1 / Tổng đúng cộng thêm 1",
          isCorrect: true,
        },
        {
          text: "The correct sum / Tổng đúng",
          isCorrect: false,
        },
        {
          text: "The correct sum minus 1 / Tổng đúng trừ đi 1",
          isCorrect: false,
        },
        {
          text: "Double the correct sum / Gấp đôi tổng đúng",
          isCorrect: false,
        },
      ],
      explanation:
        "The accumulator's starting value is part of the answer: every number is still added, so the result is exactly 1 too big. Sums start at 0; products (like factorial) start at 1.\n*Giá trị khởi đầu của biến tích lũy là một phần của đáp án: mọi số vẫn được cộng, nên kết quả lớn hơn đúng 1. Tổng bắt đầu từ 0; tích (như giai thừa) bắt đầu từ 1.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A11. Largest number, started at 0",
      content: `The numbers are \`-5, -2, -9\`. What does this code print?
*Các số là \`-5, -2, -9\`. Đoạn mã này in ra gì?*

Python:
\`\`\`
largest = 0
for n in numbers:
    if n > largest:
        largest = n
print(largest)
\`\`\`
C++:
\`\`\`
int largest = 0;
for (int n : numbers) {
    if (n > largest) largest = n;
}
cout << largest;
\`\`\``,
      options: [
        { text: "0", isCorrect: true },
        { text: "-2", isCorrect: false },
        { text: "-9", isCorrect: false },
        { text: "Error / Lỗi", isCorrect: false },
      ],
      explanation:
        "No negative number is greater than 0, so `largest` is never replaced and the code prints a value that is not even in the list. Start `largest` at the FIRST element, then it works for any input.\n*Không số âm nào lớn hơn 0, nên `largest` không bao giờ được thay thế và mã in ra một giá trị thậm chí không có trong danh sách. Hãy khởi tạo `largest` bằng phần tử ĐẦU TIÊN, khi đó mã đúng với mọi đầu vào.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A12. The while loop that never ends",
      content: `What does this code do?
*Đoạn mã này làm gì?*

Python:
\`\`\`
i = 0
while i < 5:
    print(i)
\`\`\`
C++:
\`\`\`
int i = 0;
while (i < 5) {
    cout << i << endl;
}
\`\`\``,
      options: [
        {
          text: "Prints 0 forever — an infinite loop / In 0 mãi mãi — vòng lặp vô hạn",
          isCorrect: true,
        },
        {
          text: "Prints 0 1 2 3 4 / In 0 1 2 3 4",
          isCorrect: false,
        },
        {
          text: "Prints nothing / Không in gì",
          isCorrect: false,
        },
        {
          text: "Error: i is never changed / Lỗi: i không bao giờ thay đổi",
          isCorrect: false,
        },
      ],
      explanation:
        "A `while` loop only stops when its condition becomes false, and nothing here changes `i` — so `i < 5` stays true forever. The language does not warn you; the body must move the loop toward the exit (`i = i + 1`).\n*Vòng lặp `while` chỉ dừng khi điều kiện thành sai, mà ở đây không gì thay đổi `i` — nên `i < 5` đúng mãi mãi. Ngôn ngữ không cảnh báo; thân vòng lặp phải đưa vòng lặp tiến về lối ra (`i = i + 1`).*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A13. continue vs break",
      content: `The loop goes through i = 1, 2, 3, 4, 5 and prints \`i\` after the check. What is printed with \`continue\`, and what with \`break\`?
*Vòng lặp đi qua i = 1, 2, 3, 4, 5 và in \`i\` sau phần kiểm tra. In ra gì khi dùng \`continue\`, và gì khi dùng \`break\`?*

Python:
\`\`\`
for i in range(1, 6):
    if i == 3:
        continue   # or: break
    print(i)
\`\`\`
C++:
\`\`\`
for (int i = 1; i <= 5; i++) {
    if (i == 3) continue;   // or: break;
    cout << i << " ";
}
\`\`\``,
      options: [
        {
          text: "continue: 1 2 4 5 — break: 1 2",
          isCorrect: true,
        },
        {
          text: "continue: 1 2 — break: 1 2 4 5",
          isCorrect: false,
        },
        {
          text: "Both: 1 2 4 5 / Cả hai: 1 2 4 5",
          isCorrect: false,
        },
        {
          text: "continue: 1 2 3 4 5 — break: 1 2 3",
          isCorrect: false,
        },
      ],
      explanation:
        "`continue` skips the REST of this repetition and moves to the next `i`, so only 3 is missing. `break` leaves the WHOLE loop, so nothing after 2 is printed. Neither prints 3, because the `print` comes after the check.\n*`continue` bỏ qua PHẦN CÒN LẠI của lần lặp này và sang `i` tiếp theo, nên chỉ thiếu số 3. `break` thoát TOÀN BỘ vòng lặp, nên không in gì sau 2. Cả hai đều không in 3, vì `print` nằm sau phần kiểm tra.*",
      weight: 2,
    },

    // --- Functions ---
    {
      type: "single_select",
      title: "A14. Printing is not returning",
      content: `The function prints instead of returning. What is \`x\` after this call?
*Hàm in ra thay vì trả về. \`x\` là gì sau lời gọi này?*

Python:
\`\`\`
def double(n):
    print(n * 2)

x = double(3)
\`\`\`
C++:
\`\`\`
void double_it(int n) {
    cout << n * 2;
}

int x = double_it(3);
\`\`\``,
      options: [
        {
          text: "It has no value: Python gives None, C++ refuses to compile / Không có giá trị: Python cho None, C++ không biên dịch được",
          isCorrect: true,
        },
        { text: "6", isCorrect: false },
        { text: "3", isCorrect: false },
        {
          text: '"6" as text / "6" dạng chuỗi',
          isCorrect: false,
        },
      ],
      explanation:
        "`print`/`cout` shows a value on the screen; `return` hands it back to the caller. Without `return` the caller gets nothing — Python quietly stores `None`, C++ will not compile (`void` has no value). If you need the result in a variable, return it.\n*`print`/`cout` hiển thị giá trị lên màn hình; `return` trao nó lại cho nơi gọi. Không có `return` thì nơi gọi không nhận được gì — Python âm thầm lưu `None`, C++ không biên dịch (`void` không có giá trị). Cần kết quả trong biến thì phải trả về.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A15. Code after return",
      content: `What does calling \`f()\` print?
*Gọi \`f()\` in ra gì?*

Python:
\`\`\`
def f():
    return 1
    print("after")
\`\`\`
C++:
\`\`\`
int f() {
    return 1;
    cout << "after";
}
\`\`\``,
      options: [
        {
          text: "Nothing — the line after return never runs / Không gì cả — dòng sau return không bao giờ chạy",
          isCorrect: true,
        },
        { text: "after", isCorrect: false },
        { text: "1 then after / 1 rồi after", isCorrect: false },
        { text: "Error / Lỗi", isCorrect: false },
      ],
      explanation:
        "`return` ends the function immediately; anything below it in the function is unreachable. The value 1 goes back to the caller, but it is not printed unless the caller prints it.\n*`return` kết thúc hàm ngay lập tức; mọi thứ bên dưới nó trong hàm không bao giờ được chạy. Giá trị 1 quay về nơi gọi, nhưng không được in trừ khi nơi gọi in nó.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A16. Changing a parameter",
      content: `What does this program print?
*Chương trình này in ra gì?*

Python:
\`\`\`
def add_one(n):
    n = n + 1

x = 5
add_one(x)
print(x)
\`\`\`
C++:
\`\`\`
void add_one(int n) {
    n = n + 1;
}

int x = 5;
add_one(x);
cout << x;
\`\`\``,
      options: [
        { text: "5", isCorrect: true },
        { text: "6", isCorrect: false },
        { text: "Error / Lỗi", isCorrect: false },
        { text: "None / 0", isCorrect: false },
      ],
      explanation:
        "The parameter `n` receives a COPY of the value 5. Changing `n` inside the function changes only that copy; `x` outside is untouched. To get the new value out, `return n` and assign it: `x = add_one(x)`.\n*Tham số `n` nhận một BẢN SAO của giá trị 5. Thay đổi `n` bên trong hàm chỉ thay đổi bản sao đó; `x` bên ngoài không đổi. Muốn lấy giá trị mới ra, hãy `return n` và gán: `x = add_one(x)`.*",
      weight: 2,
    },

    // --- Lists / arrays & strings ---
    {
      type: "single_select",
      title: "A17. One past the end",
      content:
        "`items` holds 5 elements. What is the LAST valid index, and what happens with `items[5]`?\n*`items` chứa 5 phần tử. Chỉ số hợp lệ CUỐI CÙNG là gì, và điều gì xảy ra với `items[5]`?*",
      options: [
        {
          text: "Last index is 4; items[5] is an error in Python and undefined (garbage or crash) in C++ / Chỉ số cuối là 4; items[5] báo lỗi trong Python và không xác định (rác hoặc sập) trong C++",
          isCorrect: true,
        },
        {
          text: "Last index is 5; items[5] is the last element / Chỉ số cuối là 5; items[5] là phần tử cuối",
          isCorrect: false,
        },
        {
          text: "Last index is 4; items[5] returns 0 / Chỉ số cuối là 4; items[5] trả về 0",
          isCorrect: false,
        },
        {
          text: "Last index is 5; items[5] is an error / Chỉ số cuối là 5; items[5] báo lỗi",
          isCorrect: false,
        },
      ],
      explanation:
        "Indexes start at 0, so 5 elements use indexes 0..4 and the last one is `length - 1`. Python stops you with IndexError; C++ silently reads memory past the end — the program may print garbage or crash later, which is worse.\n*Chỉ số bắt đầu từ 0, nên 5 phần tử dùng chỉ số 0..4 và phần tử cuối là `length - 1`. Python chặn bạn bằng IndexError; C++ âm thầm đọc bộ nhớ ngoài mảng — chương trình có thể in rác hoặc sập sau đó, còn tệ hơn.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A18. Which loop misses the last element?",
      content: `Both loops try to visit every element of \`items\`. Which one MISSES the last element?
*Cả hai vòng lặp đều cố đi qua mọi phần tử của \`items\`. Vòng nào BỎ SÓT phần tử cuối?*

Loop 1 (Python / C++):
\`\`\`
for i in range(len(items)):        |  for (int i = 0; i < items.size(); i++)
\`\`\`
Loop 2 (Python / C++):
\`\`\`
for i in range(len(items) - 1):    |  for (int i = 0; i < items.size() - 1; i++)
\`\`\``,
      options: [
        {
          text: "Loop 2 — it stops before the last index / Vòng 2 — nó dừng trước chỉ số cuối",
          isCorrect: true,
        },
        {
          text: "Loop 1 — it goes one past the end / Vòng 1 — nó đi quá cuối một bước",
          isCorrect: false,
        },
        {
          text: "Both visit every element / Cả hai đi qua mọi phần tử",
          isCorrect: false,
        },
        {
          text: "Both miss the last element / Cả hai đều bỏ sót phần tử cuối",
          isCorrect: false,
        },
      ],
      explanation:
        '`range(n)` / `i < n` already stops at `n - 1`, the last valid index — so Loop 1 is correct. Subtracting 1 "to be safe" (Loop 2) stops one element early. Subtract 1 only when you index `items[i + 1]` inside the loop.\n*`range(n)` / `i < n` đã dừng ở `n - 1`, chỉ số hợp lệ cuối — nên vòng 1 đúng. Trừ 1 "cho chắc" (vòng 2) làm dừng sớm một phần tử. Chỉ trừ 1 khi bên trong vòng lặp bạn truy cập `items[i + 1]`.*',
      weight: 2,
    },
    {
      type: "single_select",
      title: "A19. Comparing strings",
      content:
        'What are `"apple" < "banana"` and `"Zebra" < "apple"`?\n*`"apple" < "banana"` và `"Zebra" < "apple"` có giá trị gì?*',
      options: [
        { text: "true and true", isCorrect: true },
        { text: "true and false", isCorrect: false },
        { text: "false and true", isCorrect: false },
        { text: "false and false", isCorrect: false },
      ],
      explanation:
        'Strings compare character by character using each character\'s code, like dictionary order — `a` < `b` so apple < banana. But ALL uppercase letters have smaller codes than lowercase ones, so `Z` (90) < `a` (97) and "Zebra" sorts before "apple". Convert to one case before sorting names.\n*Chuỗi được so sánh từng ký tự theo mã của ký tự, như thứ tự từ điển — `a` < `b` nên apple < banana. Nhưng MỌI chữ hoa có mã nhỏ hơn chữ thường, nên `Z` (90) < `a` (97) và "Zebra" đứng trước "apple". Hãy chuyển về cùng một kiểu chữ trước khi sắp xếp tên.*',
      weight: 2,
    },
    {
      type: "single_select",
      title: "A20. Counting a word that is not there yet",
      content: `\`count\` is an empty dictionary (Python) / map (C++). What happens on the first time a word is counted?
*\`count\` là một dictionary (Python) / map (C++) rỗng. Điều gì xảy ra lần đầu tiên một từ được đếm?*

Python:
\`\`\`
count[word] = count[word] + 1
\`\`\`
C++:
\`\`\`
count[word] = count[word] + 1;
\`\`\``,
      options: [
        {
          text: "Python: error (KeyError). C++: the key is created with 0, so it becomes 1 / Python: lỗi (KeyError). C++: khóa được tạo với 0, nên thành 1",
          isCorrect: true,
        },
        {
          text: "Both give an error / Cả hai đều báo lỗi",
          isCorrect: false,
        },
        {
          text: "Both create the key and set it to 1 / Cả hai tạo khóa và đặt bằng 1",
          isCorrect: false,
        },
        {
          text: "Both set it to 0 / Cả hai đặt bằng 0",
          isCorrect: false,
        },
      ],
      explanation:
        "Reading a missing key is an error in Python, so the counting pattern needs a check first: `if word in count: count[word] += 1 else: count[word] = 1` (or `count.get(word, 0) + 1`). A C++ `map` auto-creates a missing key with 0, so the one-liner works there — the same line behaves differently in the two languages.\n*Đọc một khóa chưa có là lỗi trong Python, nên mẫu đếm cần kiểm tra trước: `if word in count: count[word] += 1 else: count[word] = 1` (hoặc `count.get(word, 0) + 1`). `map` trong C++ tự tạo khóa thiếu với giá trị 0, nên dòng lệnh một dòng chạy được — cùng một dòng nhưng hai ngôn ngữ hành xử khác nhau.*",
      weight: 2,
    },

    // ==================== PART B — SHORT CODING (free-text, weight 3 each) ====================
    // Answer in Python OR C++. referenceAnswer carries both solutions for the grader.

    // --- Conditionals ---
    {
      type: "free_text",
      title: "B1. Sum and Difference",
      content: `Read two integers (each on its own line). Print their sum on the first line and their difference (first minus second) on the second line.
*Đọc hai số nguyên (mỗi số một dòng). In tổng của chúng ở dòng đầu và hiệu (số thứ nhất trừ số thứ hai) ở dòng thứ hai.*

**Example Input:**
\`\`\`
9
4
\`\`\`

**Example Output:**
\`\`\`
13
5
\`\`\``,
      referenceAnswer: `# Python
a = int(input())
b = int(input())
print(a + b)
print(a - b)

// C++
#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    cout << a - b << endl;
}`,
      explanation: `Read both numbers as integers, then print the two results on separate lines. The only trap is the order of the subtraction (first minus second).
*Đọc hai số dưới dạng số nguyên rồi in hai kết quả trên hai dòng. Điểm cần chú ý duy nhất là thứ tự phép trừ (số thứ nhất trừ số thứ hai).*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B2. Even or Odd",
      content: `Read an integer and print \`Even\` if it is even, or \`Odd\` if it is odd.
*Đọc một số nguyên và in \`Even\` nếu là số chẵn, hoặc \`Odd\` nếu là số lẻ.*

**Example Input:**
\`\`\`
7
\`\`\`

**Example Output:**
\`\`\`
Odd
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
if n % 2 == 0:
    print("Even")
else:
    print("Odd")

// C++
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    if (n % 2 == 0) cout << "Even" << endl;
    else cout << "Odd" << endl;
}`,
      explanation: `\`n % 2 == 0\` is the standard even test; two outcomes map onto a single if/else. Boundary: 0 is even.
*\`n % 2 == 0\` là cách kiểm tra số chẵn chuẩn; hai kết quả tương ứng với một if/else. Biên: 0 là số chẵn.*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B3. Larger of Two",
      content: `Read two integers (each on its own line) and print the larger one. If they are equal, print that value.
*Đọc hai số nguyên (mỗi số một dòng) và in ra số lớn hơn. Nếu bằng nhau, in giá trị đó.*

**Example Input:**
\`\`\`
4
9
\`\`\`

**Example Output:**
\`\`\`
9
\`\`\``,
      referenceAnswer: `# Python
a = int(input())
b = int(input())
if a >= b:
    print(a)
else:
    print(b)

// C++
#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    if (a >= b) cout << a << endl;
    else cout << b << endl;
}`,
      explanation: `Compare with \`>=\` so the tie case falls into the first branch and still prints the shared value. Using a built-in max is also acceptable here.
*So sánh bằng \`>=\` để trường hợp bằng nhau rơi vào nhánh đầu và vẫn in đúng giá trị. Dùng hàm max có sẵn cũng được chấp nhận ở bài này.*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B4. Pass or Fail",
      content: `Read a score (an integer from 0 to 100). Print \`Pass\` if the score is 50 or higher, otherwise print \`Fail\`.
*Đọc một điểm số (số nguyên từ 0 đến 100). In \`Pass\` nếu điểm từ 50 trở lên, ngược lại in \`Fail\`.*

**Example Input:**
\`\`\`
50
\`\`\`

**Example Output:**
\`\`\`
Pass
\`\`\``,
      referenceAnswer: `# Python
score = int(input())
if score >= 50:
    print("Pass")
else:
    print("Fail")

// C++
#include <iostream>
using namespace std;
int main() {
    int score;
    cin >> score;
    if (score >= 50) cout << "Pass" << endl;
    else cout << "Fail" << endl;
}`,
      explanation: `"50 or higher" means \`>=\`, not \`>\` — the example input 50 is exactly the boundary and must print Pass.
*"Từ 50 trở lên" nghĩa là \`>=\`, không phải \`>\` — đầu vào ví dụ 50 nằm đúng ở biên và phải in Pass.*`,
      weight: 3,
    },

    // --- Loops ---
    {
      type: "free_text",
      title: "B5. Count Up",
      content: `Read a positive integer N and print the numbers from 1 to N, each on its own line.
*Đọc một số nguyên dương N và in các số từ 1 đến N, mỗi số một dòng.*

**Example Input:**
\`\`\`
4
\`\`\`

**Example Output:**
\`\`\`
1
2
3
4
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
for i in range(1, n + 1):
    print(i)

// C++
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    for (int i = 1; i <= n; i++) {
        cout << i << endl;
    }
}`,
      explanation: `A counting loop from 1 to N inclusive. Watch the upper bound: Python \`range(1, n + 1)\` / C++ \`i <= n\` — an off-by-one stops at N-1.
*Vòng lặp đếm từ 1 đến N (bao gồm N). Chú ý cận trên: Python \`range(1, n + 1)\` / C++ \`i <= n\` — sai một đơn vị sẽ dừng ở N-1.*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B6. Sum from 1 to N",
      content: `Read a positive integer N and print the sum 1 + 2 + ... + N. Use a loop.
*Đọc một số nguyên dương N và in tổng 1 + 2 + ... + N. Dùng vòng lặp.*

**Example Input:**
\`\`\`
5
\`\`\`

**Example Output:**
\`\`\`
15
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
total = 0
for i in range(1, n + 1):
    total = total + i
print(total)

// C++
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    int total = 0;
    for (int i = 1; i <= n; i++) {
        total = total + i;
    }
    cout << total << endl;
}`,
      explanation: `The accumulator pattern: start \`total\` at 0 and add each \`i\` inside the loop; print once after the loop ends.
*Mẫu biến tích lũy: khởi tạo \`total\` = 0 và cộng từng \`i\` trong vòng lặp; in một lần sau khi vòng lặp kết thúc.*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B7. Multiplication Table",
      content: `Read a positive integer N and print its multiplication table from 1 to 10, one line per product, in the format \`N x i = result\`.
*Đọc một số nguyên dương N và in bảng cửu chương của nó từ 1 đến 10, mỗi phép nhân một dòng, theo định dạng \`N x i = result\`.*

**Example Input:**
\`\`\`
3
\`\`\`

**Example Output:**
\`\`\`
3 x 1 = 3
3 x 2 = 6
3 x 3 = 9
3 x 4 = 12
3 x 5 = 15
3 x 6 = 18
3 x 7 = 21
3 x 8 = 24
3 x 9 = 27
3 x 10 = 30
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
for i in range(1, 11):
    print(f"{n} x {i} = {n * i}")

// C++
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    for (int i = 1; i <= 10; i++) {
        cout << n << " x " << i << " = " << n * i << endl;
    }
}`,
      explanation: `A fixed loop 1..10 where each line combines the loop variable with the product. Grade mainly on the loop; be lenient on spacing inside the line.
*Vòng lặp cố định 1..10, mỗi dòng ghép biến đếm với tích. Chấm chủ yếu ở vòng lặp; châm chước khoảng trắng trong dòng.*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B8. Count the Evens",
      content: `Read an integer N, then N integers (each on its own line). Print how many of them are even.
*Đọc một số nguyên N, rồi N số nguyên (mỗi số một dòng). In ra có bao nhiêu số trong đó là số chẵn.*

**Example Input:**
\`\`\`
5
3
8
10
7
2
\`\`\`

**Example Output:**
\`\`\`
3
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
count = 0
for i in range(n):
    x = int(input())
    if x % 2 == 0:
        count = count + 1
print(count)

// C++
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    int count = 0;
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        if (x % 2 == 0) count = count + 1;
    }
    cout << count << endl;
}`,
      explanation: `The counting pattern: read N first so the loop knows how many values follow, then increment a counter only when the condition holds. No list is needed.
*Mẫu đếm: đọc N trước để vòng lặp biết có bao nhiêu giá trị theo sau, rồi chỉ tăng biến đếm khi điều kiện đúng. Không cần danh sách.*`,
      weight: 3,
    },

    // --- Functions ---
    {
      type: "free_text",
      title: "B9. A square function",
      content: `Write a function \`square\` that takes one number and RETURNS that number multiplied by itself. Then read an integer, call \`square\` on it, and print the result.
*Viết một hàm \`square\` nhận một số và TRẢ VỀ số đó nhân với chính nó. Sau đó đọc một số nguyên, gọi \`square\` với số đó, và in kết quả.*

**Example Input:**
\`\`\`
6
\`\`\`

**Example Output:**
\`\`\`
36
\`\`\``,
      referenceAnswer: `# Python
def square(n):
    return n * n

x = int(input())
print(square(x))

// C++
#include <iostream>
using namespace std;

int square(int n) {
    return n * n;
}

int main() {
    int x;
    cin >> x;
    cout << square(x) << endl;
}`,
      explanation: `The function must use \`return\` (not print) so the caller receives the value; the print happens outside the function. A function that prints instead of returning loses the "returns" part of the rubric.
*Hàm phải dùng \`return\` (không phải in) để nơi gọi nhận được giá trị; việc in diễn ra bên ngoài hàm. Hàm in thay vì trả về sẽ mất phần "trả về" trong thang điểm.*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B10. A greet function",
      content: `Write a function \`greet\` that takes a name and PRINTS \`Hello, <name>!\`. Then read a name (one line of text) and call \`greet\` with it.
*Viết một hàm \`greet\` nhận một cái tên và IN ra \`Hello, <name>!\`. Sau đó đọc một cái tên (một dòng văn bản) và gọi \`greet\` với tên đó.*

**Example Input:**
\`\`\`
Linh
\`\`\`

**Example Output:**
\`\`\`
Hello, Linh!
\`\`\``,
      referenceAnswer: `# Python
def greet(name):
    print(f"Hello, {name}!")

name = input()
greet(name)

// C++
#include <iostream>
#include <string>
using namespace std;

void greet(string name) {
    cout << "Hello, " << name << "!" << endl;
}

int main() {
    string name;
    getline(cin, name);
    greet(name);
}`,
      explanation: `A function with a parameter and no return value: it does its work (printing) itself. Check the exact output punctuation: comma, space, and the closing \`!\`.
*Hàm có tham số và không trả về giá trị: nó tự làm việc (in ra). Kiểm tra đúng dấu câu: dấu phẩy, khoảng trắng và dấu \`!\` ở cuối.*`,
      weight: 3,
    },

    // --- Lists / arrays ---
    {
      type: "free_text",
      title: "B11. Largest of N",
      content: `Read an integer N, then N integers (each on its own line). Print the largest one. Do NOT use a built-in max function — keep track of the largest value yourself as you read.
*Đọc một số nguyên N, rồi N số nguyên (mỗi số một dòng). In ra số lớn nhất. KHÔNG dùng hàm max có sẵn — tự theo dõi giá trị lớn nhất trong khi đọc.*

**Example Input:**
\`\`\`
4
5
12
3
9
\`\`\`

**Example Output:**
\`\`\`
12
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
largest = int(input())
for i in range(n - 1):
    x = int(input())
    if x > largest:
        largest = x
print(largest)

// C++
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    int largest;
    cin >> largest;
    for (int i = 1; i < n; i++) {
        int x;
        cin >> x;
        if (x > largest) largest = x;
    }
    cout << largest << endl;
}`,
      explanation: `The running-max pattern: start \`largest\` at the FIRST value (not at 0, which fails for all-negative input), then replace it whenever a bigger value appears. Storing the values in a list and looping is also fine.
*Mẫu tìm max dần: khởi tạo \`largest\` bằng giá trị ĐẦU TIÊN (không phải 0, vì sẽ sai nếu toàn số âm), rồi thay thế mỗi khi gặp giá trị lớn hơn. Lưu vào danh sách rồi duyệt cũng được.*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B12. Reverse Order",
      content: `Read an integer N, then N integers (each on its own line). Print them in REVERSE order on one line, separated by single spaces.
*Đọc một số nguyên N, rồi N số nguyên (mỗi số một dòng). In chúng theo thứ tự NGƯỢC LẠI trên một dòng, cách nhau bởi một khoảng trắng.*

**Example Input:**
\`\`\`
4
1
2
3
4
\`\`\`

**Example Output:**
\`\`\`
4 3 2 1
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
numbers = []
for i in range(n):
    numbers.append(int(input()))
for i in range(n - 1, -1, -1):
    print(numbers[i], end=" ")
print()

// C++
#include <iostream>
#include <vector>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> numbers;
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        numbers.push_back(x);
    }
    for (int i = n - 1; i >= 0; i--) {
        cout << numbers[i] << " ";
    }
    cout << endl;
}`,
      explanation: `The values must be stored (list / vector) because the last one read is printed first. Then loop the indexes backwards from N-1 down to 0. Python's \`numbers[::-1]\` or \`reversed()\` is fine too. Be lenient about a trailing space.
*Phải lưu các giá trị (list / vector) vì số đọc cuối cùng lại in đầu tiên. Sau đó duyệt chỉ số ngược từ N-1 về 0. Python dùng \`numbers[::-1]\` hoặc \`reversed()\` cũng được. Châm chước khoảng trắng thừa ở cuối.*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B13. Average with 2 Decimals",
      content: `Read an integer N, then N integers (each on its own line). Print their average with exactly 2 decimal places.
*Đọc một số nguyên N, rồi N số nguyên (mỗi số một dòng). In trung bình cộng của chúng với đúng 2 chữ số thập phân.*

**Example Input:**
\`\`\`
3
7
8
10
\`\`\`

**Example Output:**
\`\`\`
8.33
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
total = 0
for i in range(n):
    total = total + int(input())
average = total / n
print(f"{average:.2f}")

// C++
#include <iostream>
#include <iomanip>
using namespace std;
int main() {
    int n;
    cin >> n;
    int total = 0;
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        total = total + x;
    }
    double average = (double) total / n;
    cout << fixed << setprecision(2) << average << endl;
}`,
      explanation: `Sum first, divide once. Two traps: in C++ the division must be done in floating point (cast one side to \`double\`), and the output needs fixed 2-decimal formatting (\`:.2f\` / \`fixed << setprecision(2)\`).
*Cộng tổng trước, chia một lần. Hai điểm dễ sai: trong C++ phép chia phải là số thực (ép một vế sang \`double\`), và đầu ra cần định dạng đúng 2 chữ số thập phân (\`:.2f\` / \`fixed << setprecision(2)\`).*`,
      weight: 3,
    },

    // --- Strings ---
    {
      type: "free_text",
      title: "B14. First, Last and Length",
      content: `Read a word (one line, no spaces). Print its first character, its last character, and its length, each on its own line.
*Đọc một từ (một dòng, không có khoảng trắng). In ký tự đầu, ký tự cuối và độ dài của nó, mỗi giá trị một dòng.*

**Example Input:**
\`\`\`
banana
\`\`\`

**Example Output:**
\`\`\`
b
a
6
\`\`\``,
      referenceAnswer: `# Python
word = input()
print(word[0])
print(word[-1])
print(len(word))

// C++
#include <iostream>
#include <string>
using namespace std;
int main() {
    string word;
    cin >> word;
    cout << word[0] << endl;
    cout << word[word.size() - 1] << endl;
    cout << word.size() << endl;
}`,
      explanation: `A string is a sequence: index 0 is the first character. The last character is \`word[-1]\` in Python, but C++ has no negative indexing — use \`word[word.size() - 1]\`.
*Chuỗi là một dãy: chỉ số 0 là ký tự đầu. Ký tự cuối là \`word[-1]\` trong Python, nhưng C++ không có chỉ số âm — dùng \`word[word.size() - 1]\`.*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B15. Reverse a String",
      content: `Read a word (one line, no spaces) and print it backwards.
*Đọc một từ (một dòng, không có khoảng trắng) và in nó theo thứ tự ngược lại.*

**Example Input:**
\`\`\`
Python
\`\`\`

**Example Output:**
\`\`\`
nohtyP
\`\`\``,
      referenceAnswer: `# Python
word = input()
print(word[::-1])

# Python (loop version, also accepted)
# result = ""
# for ch in word:
#     result = ch + result
# print(result)

// C++
#include <iostream>
#include <string>
using namespace std;
int main() {
    string word;
    cin >> word;
    for (int i = word.size() - 1; i >= 0; i--) {
        cout << word[i];
    }
    cout << endl;
}`,
      explanation: `Either slice with step -1 (Python) or loop the indexes from the end down to 0 (works in both languages). Building a new string by prepending each character is also correct.
*Dùng slice bước -1 (Python) hoặc duyệt chỉ số từ cuối về 0 (được ở cả hai ngôn ngữ). Xây chuỗi mới bằng cách thêm từng ký tự vào đầu cũng đúng.*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B16. Count Vowels",
      content: `Read a word (one line, lowercase letters only) and print how many vowels it contains. Vowels are \`a e i o u\`.
*Đọc một từ (một dòng, chỉ gồm chữ thường) và in ra số nguyên âm trong từ đó. Nguyên âm là \`a e i o u\`.*

**Example Input:**
\`\`\`
education
\`\`\`

**Example Output:**
\`\`\`
5
\`\`\``,
      referenceAnswer: `# Python
word = input()
count = 0
for ch in word:
    if ch in "aeiou":
        count = count + 1
print(count)

// C++
#include <iostream>
#include <string>
using namespace std;
int main() {
    string word;
    cin >> word;
    int count = 0;
    for (char ch : word) {
        if (ch == 'a' || ch == 'e' || ch == 'i' || ch == 'o' || ch == 'u') {
            count = count + 1;
        }
    }
    cout << count << endl;
}`,
      explanation: `Loop over each character and count the ones that are vowels. Python can test membership with \`ch in "aeiou"\`; C++ compares against each vowel with \`||\` (or uses \`string("aeiou").find(ch)\`).
*Duyệt từng ký tự và đếm những ký tự là nguyên âm. Python kiểm tra bằng \`ch in "aeiou"\`; C++ so sánh với từng nguyên âm bằng \`||\` (hoặc dùng \`string("aeiou").find(ch)\`).*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B17. Shout",
      content: `Read a word (one line) and print it in UPPERCASE.
*Đọc một từ (một dòng) và in nó bằng CHỮ IN HOA.*

**Example Input:**
\`\`\`
hello
\`\`\`

**Example Output:**
\`\`\`
HELLO
\`\`\``,
      referenceAnswer: `# Python
word = input()
print(word.upper())

// C++
#include <iostream>
#include <string>
#include <cctype>
using namespace std;
int main() {
    string word;
    cin >> word;
    for (int i = 0; i < word.size(); i++) {
        word[i] = toupper(word[i]);
    }
    cout << word << endl;
}`,
      explanation: `Python has \`.upper()\` for the whole string. C++ converts character by character with \`toupper\` — and because \`std::string\` is mutable, the characters can be replaced in place.
*Python có \`.upper()\` cho cả chuỗi. C++ chuyển từng ký tự bằng \`toupper\` — và vì \`std::string\` thay đổi được nên có thể ghi đè ngay tại chỗ.*`,
      weight: 3,
    },

    // --- Algorithms + dictionary / map ---
    {
      type: "free_text",
      title: "B18. Palindrome",
      content: `Read a word (one line, lowercase letters only). Print \`Yes\` if it reads the same forwards and backwards (a palindrome), otherwise print \`No\`.
*Đọc một từ (một dòng, chỉ gồm chữ thường). In \`Yes\` nếu đọc xuôi và đọc ngược đều giống nhau (chuỗi đối xứng), ngược lại in \`No\`.*

**Example Input:**
\`\`\`
level
\`\`\`

**Example Output:**
\`\`\`
Yes
\`\`\``,
      referenceAnswer: `# Python
word = input()
if word == word[::-1]:
    print("Yes")
else:
    print("No")

// C++
#include <iostream>
#include <string>
using namespace std;
int main() {
    string word;
    cin >> word;
    bool same = true;
    int n = word.size();
    for (int i = 0; i < n / 2; i++) {
        if (word[i] != word[n - 1 - i]) same = false;
    }
    if (same) cout << "Yes" << endl;
    else cout << "No" << endl;
}`,
      explanation: `Two valid approaches: compare the word with its reverse (Python slice), or walk from both ends comparing \`word[i]\` with \`word[n-1-i]\` and stop at the middle. Either one is full credit.
*Hai cách đều đúng: so sánh từ với chuỗi đảo ngược của nó (slice trong Python), hoặc đi từ hai đầu so sánh \`word[i]\` với \`word[n-1-i]\` đến giữa. Cách nào cũng được điểm tối đa.*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B19. Find the Position",
      content: `Read an integer N, then N integers (each on its own line), then one more integer: the target. Print the position (index starting at 0) of the FIRST place the target appears. If it does not appear, print \`-1\`.
*Đọc một số nguyên N, rồi N số nguyên (mỗi số một dòng), rồi thêm một số nguyên nữa: số cần tìm. In vị trí (chỉ số bắt đầu từ 0) của lần xuất hiện ĐẦU TIÊN của số cần tìm. Nếu không xuất hiện, in \`-1\`.*

**Example Input:**
\`\`\`
5
4
8
15
8
3
8
\`\`\`

**Example Output:**
\`\`\`
1
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
numbers = []
for i in range(n):
    numbers.append(int(input()))
target = int(input())
position = -1
for i in range(n):
    if numbers[i] == target:
        position = i
        break
print(position)

// C++
#include <iostream>
#include <vector>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> numbers(n);
    for (int i = 0; i < n; i++) cin >> numbers[i];
    int target;
    cin >> target;
    int position = -1;
    for (int i = 0; i < n; i++) {
        if (numbers[i] == target) {
            position = i;
            break;
        }
    }
    cout << position << endl;
}`,
      explanation: `Linear search: start with \`position = -1\` (the "not found" answer), scan the indexes in order, and \`break\` at the first match so a later duplicate (index 3 here) does not overwrite it.
*Tìm kiếm tuyến tính: khởi tạo \`position = -1\` (đáp án "không tìm thấy"), duyệt các chỉ số theo thứ tự, và \`break\` ở lần khớp đầu tiên để lần trùng sau (chỉ số 3 ở đây) không ghi đè.*`,
      weight: 3,
    },
    {
      type: "free_text",
      title: "B20. Age Lookup",
      content: `Read an integer N, then N lines, each with a name and an age separated by a space. Then read one more name. Print that person's age, or \`Not found\` if the name was not in the list. Use a dictionary (Python) or map (C++).
*Đọc một số nguyên N, rồi N dòng, mỗi dòng gồm một tên và một tuổi cách nhau bởi khoảng trắng. Sau đó đọc thêm một tên nữa. In tuổi của người đó, hoặc \`Not found\` nếu tên không có trong danh sách. Dùng dictionary (Python) hoặc map (C++).*

**Example Input:**
\`\`\`
3
An 13
Binh 14
Chi 12
Binh
\`\`\`

**Example Output:**
\`\`\`
14
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
ages = {}
for i in range(n):
    name, age = input().split()
    ages[name] = int(age)
query = input()
if query in ages:
    print(ages[query])
else:
    print("Not found")

// C++
#include <iostream>
#include <map>
#include <string>
using namespace std;
int main() {
    int n;
    cin >> n;
    map<string, int> ages;
    for (int i = 0; i < n; i++) {
        string name;
        int age;
        cin >> name >> age;
        ages[name] = age;
    }
    string query;
    cin >> query;
    if (ages.count(query) > 0) cout << ages[query] << endl;
    else cout << "Not found" << endl;
}`,
      explanation: `Store name → age as key/value pairs, then look up by key. The membership check (\`in\` / \`count\`) must come BEFORE the lookup, otherwise a missing name is an error in Python (KeyError) or silently inserts 0 in C++.
*Lưu tên → tuổi dưới dạng khóa/giá trị, rồi tra theo khóa. Phải kiểm tra tồn tại (\`in\` / \`count\`) TRƯỚC khi tra, nếu không tên không có sẽ gây lỗi trong Python (KeyError) hoặc âm thầm chèn 0 trong C++.*`,
      weight: 3,
    },
  ],
};
