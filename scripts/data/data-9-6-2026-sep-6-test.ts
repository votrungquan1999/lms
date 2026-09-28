/**
 * Sep 6 Test — 30 questions, language-agnostic (bilingual EN/VN).
 *
 * Second test in the Python-or-C++ series (after the 40-Q review, f87f3005…).
 * All questions are NEW — no overlap with that test.
 *
 * Structure:
 *   Part A — 20 concept MC (single_select, weight 2, misconception-targeted,
 *            each with a bilingual explanation shown after answer release)
 *   Part B — 10 short coding problems: B1–B7 easy (weight 4), B8–B10 medium (weight 6)
 * Grade split: MC 40 / coding 46 ≈ 47% / 53%. Graded, untimed, exam-safe flags.
 * referenceAnswer carries a Python AND a C++ solution (teacher/AI-grader facing).
 *
 * Seed: bun scripts/create-test.ts scripts/data/data-9-6-2026-sep-6-test.ts
 */
export default {
  courseId: "c98f8f96-916d-48e0-a67b-a161c2cf422c",
  test: {
    title: "Sep 6 Test",
    description:
      "Test for Sunday, Sep 6. Answer coding questions in Python OR C++, your choice. Each program reads its input exactly as described and prints only the result (no prompt text).\n*Bài kiểm tra cho Chủ nhật, ngày 6 tháng 9. Trả lời các câu lập trình bằng Python HOẶC C++, tùy bạn chọn. Mỗi chương trình đọc đầu vào đúng như mô tả và chỉ in ra kết quả (không in lời nhắc).*",
    showCorrectAnswerAfterSubmit: false,
    showGradeAfterSubmit: false,
  },
  questions: [
    // ==================== PART A — CONCEPT MC (weight 2 each) ====================

    // --- Arithmetic ---
    {
      type: "single_select",
      title: "A1. Reverse the digits",
      content: `What does this print?
*Đoạn này in ra gì?*
\`\`\`
n = 47
a = n % 10
b = n // 10        (C++: b = n / 10 with ints)
print(a * 10 + b)
\`\`\``,
      options: [
        { text: "74", isCorrect: true },
        { text: "47", isCorrect: false },
        { text: "11", isCorrect: false },
        { text: "4", isCorrect: false },
      ],
      explanation:
        "`% 10` takes the last digit (a = 7) and integer division by 10 removes it (b = 4); `a * 10 + b` rebuilds the number with the digits SWAPPED: 74. This take-apart / rebuild pattern is how numbers are reversed digit by digit.\n*`% 10` lấy chữ số cuối (a = 7) và chia nguyên cho 10 xóa nó (b = 4); `a * 10 + b` ghép lại số với hai chữ số ĐỔI CHỖ: 74. Mẫu tách ra / ghép lại này là cách đảo ngược số theo từng chữ số.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A2. Counting with a condition",
      content: `How many numbers does this count?
*Đoạn này đếm được bao nhiêu số?*

Python:
\`\`\`
count = 0
for i in range(1, 11):
    if i % 3 == 0 or i % 4 == 0:
        count = count + 1
\`\`\`
C++:
\`\`\`
int count = 0;
for (int i = 1; i <= 10; i++) {
    if (i % 3 == 0 || i % 4 == 0) count++;
}
\`\`\``,
      options: [
        { text: "5", isCorrect: true },
        { text: "6", isCorrect: false },
        { text: "3", isCorrect: false },
        { text: "8", isCorrect: false },
      ],
      explanation:
        "Multiples of 3 up to 10: 3, 6, 9. Multiples of 4: 4, 8. `or` counts a number once when EITHER condition holds — 5 in total. (12 would satisfy both but is outside the range; with it, `or` still counts it once, not twice.)\n*Bội của 3 đến 10: 3, 6, 9. Bội của 4: 4, 8. `or` đếm một số một lần khi MỘT trong hai điều kiện đúng — tổng cộng 5. (12 thỏa cả hai nhưng ngoài khoảng; nếu có, `or` vẫn chỉ đếm một lần.)*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A3. Two updates in a row",
      content: `What is \`x\` after these three lines (same in Python and C++)?
*\`x\` bằng bao nhiêu sau ba dòng này (giống nhau ở Python và C++)?*
\`\`\`
x = 2
x = x * x
x = x + x
\`\`\``,
      options: [
        { text: "8", isCorrect: true },
        { text: "6", isCorrect: false },
        { text: "16", isCorrect: false },
        { text: "4", isCorrect: false },
      ],
      explanation:
        "Each line uses the CURRENT value of x: `x * x` = 4, then `x + x` = 4 + 4 = 8. Getting 6 means the second line was read with the old x (2 * 2 then 4 + 2); tracing line by line with the updated value is the skill here.\n*Mỗi dòng dùng giá trị HIỆN TẠI của x: `x * x` = 4, rồi `x + x` = 4 + 4 = 8. Ra 6 nghĩa là đọc dòng hai với x cũ (2 * 2 rồi 4 + 2); kỹ năng ở đây là dò từng dòng với giá trị đã cập nhật.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A4. 9 divided by 2 in each language",
      content:
        "What is `9 / 2` in Python, and in C++ when both numbers are ints?\n*`9 / 2` bằng bao nhiêu trong Python, và trong C++ khi cả hai là số int?*",
      options: [
        { text: "Python: 4.5, C++: 4", isCorrect: true },
        { text: "4.5 in both / 4.5 ở cả hai", isCorrect: false },
        { text: "4 in both / 4 ở cả hai", isCorrect: false },
        { text: "Python: 4, C++: 4.5", isCorrect: false },
      ],
      explanation:
        "Python's `/` ALWAYS gives a decimal result (use `//` for integer division). C++'s `/` on two ints is integer division and truncates to 4. Same symbol, different rule — a classic source of bugs when switching languages.\n*`/` của Python LUÔN cho kết quả thập phân (dùng `//` để chia nguyên). `/` của C++ trên hai int là chia nguyên và cắt còn 4. Cùng ký hiệu, khác quy tắc — nguồn lỗi kinh điển khi đổi ngôn ngữ.*",
      weight: 2,
    },

    // --- Conditions ---
    {
      type: "single_select",
      title: "A5. Negating a comparison",
      content:
        "`not (x > 3)` (C++: `!(x > 3)`) is true exactly when...\n*`not (x > 3)` (C++: `!(x > 3)`) đúng khi và chỉ khi...*",
      options: [
        { text: "x <= 3", isCorrect: true },
        { text: "x < 3", isCorrect: false },
        { text: "x >= 3", isCorrect: false },
        { text: "x != 3", isCorrect: false },
      ],
      explanation:
        'The opposite of "greater than" is "less than OR EQUAL": x = 3 makes `x > 3` false, so the negation must be true there. Forgetting the boundary case turns the negation into `x < 3`, which wrongly excludes 3.\n*Phủ định của "lớn hơn" là "nhỏ hơn HOẶC BẰNG": x = 3 làm `x > 3` sai, nên phủ định phải đúng tại đó. Quên trường hợp biên sẽ biến phủ định thành `x < 3`, loại nhầm số 3.*',
      weight: 2,
    },
    {
      type: "single_select",
      title: "A6. Negating an and",
      content:
        "`not (a and b)` (C++: `!(a && b)`) is the same as which expression?\n*`not (a and b)` (C++: `!(a && b)`) giống với biểu thức nào?*",
      options: [
        {
          text: "(not a) or (not b)",
          isCorrect: true,
        },
        {
          text: "(not a) and (not b)",
          isCorrect: false,
        },
        { text: "a or b", isCorrect: false },
        { text: "not a", isCorrect: false },
      ],
      explanation:
        '"NOT (both true)" means "at least one is false" — the `not` flips `and` into `or` when it moves inside. Test a = true, b = false: `not (a and b)` is true, but `(not a) and (not b)` is false, so they differ.\n*"KHÔNG (cả hai đúng)" nghĩa là "ít nhất một cái sai" — `not` biến `and` thành `or` khi đi vào trong. Thử a = true, b = false: `not (a and b)` đúng, còn `(not a) and (not b)` sai, nên chúng khác nhau.*',
      weight: 2,
    },
    {
      type: "single_select",
      title: "A7. An if inside an if",
      content: `When does this print \`ok\`?
*Khi nào đoạn này in \`ok\`?*

Python:
\`\`\`
if a:
    if b:
        print("ok")
\`\`\`
C++:
\`\`\`
if (a) {
    if (b) cout << "ok";
}
\`\`\``,
      options: [
        {
          text: "Only when BOTH a and b are true — same as `a and b` / Chỉ khi CẢ a và b đều đúng — giống `a and b`",
          isCorrect: true,
        },
        {
          text: "When a or b is true / Khi a hoặc b đúng",
          isCorrect: false,
        },
        {
          text: "Whenever a is true / Bất cứ khi nào a đúng",
          isCorrect: false,
        },
        {
          text: "Whenever b is true / Bất cứ khi nào b đúng",
          isCorrect: false,
        },
      ],
      explanation:
        "The inner `if` only runs after the outer one passed, so both conditions must hold — nesting is another spelling of `and`. Flattening it to one condition usually reads better.\n*`if` bên trong chỉ chạy sau khi `if` bên ngoài đã đúng, nên cả hai điều kiện phải thỏa — lồng nhau là một cách viết khác của `and`. Gộp về một điều kiện thường dễ đọc hơn.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A8. Which branch wins?",
      content: `With \`x = 200\`, what does this print?
*Với \`x = 200\`, đoạn này in ra gì?*

Python:
\`\`\`
if x > 0:
    print("positive")
elif x > 100:
    print("huge")
\`\`\`
C++:
\`\`\`
if (x > 0) cout << "positive";
else if (x > 100) cout << "huge";
\`\`\``,
      options: [
        { text: "positive", isCorrect: true },
        { text: "huge", isCorrect: false },
        {
          text: "positive then huge / positive rồi huge",
          isCorrect: false,
        },
        { text: "Nothing / Không gì cả", isCorrect: false },
      ],
      explanation:
        "The chain stops at the FIRST true condition, and `x > 0` is already true for 200 — so the `huge` branch can never be reached by any number. Order conditions from most specific to most general (`> 100` first).\n*Chuỗi dừng ở điều kiện đúng ĐẦU TIÊN, và `x > 0` đã đúng với 200 — nên nhánh `huge` không số nào chạm tới được. Hãy xếp điều kiện từ cụ thể nhất đến chung nhất (`> 100` trước).*",
      weight: 2,
    },

    // --- Loops ---
    {
      type: "single_select",
      title: "A9. Doubling past the limit",
      content: `What does this print?
*Đoạn này in ra gì?*

Python:
\`\`\`
i = 1
while i < 20:
    i = i * 2
print(i)
\`\`\`
C++:
\`\`\`
int i = 1;
while (i < 20) {
    i = i * 2;
}
cout << i;
\`\`\``,
      options: [
        { text: "32", isCorrect: true },
        { text: "16", isCorrect: false },
        { text: "20", isCorrect: false },
        { text: "64", isCorrect: false },
      ],
      explanation:
        "The condition is checked BEFORE each pass, so 16 (< 20) still enters the loop and doubles to 32; only then does `32 < 20` fail. A while loop can overshoot its limit — the final value is not necessarily under the bound.\n*Điều kiện được kiểm tra TRƯỚC mỗi lượt, nên 16 (< 20) vẫn vào vòng lặp và nhân đôi thành 32; sau đó `32 < 20` mới sai. Vòng while có thể vượt quá giới hạn — giá trị cuối không nhất thiết dưới ngưỡng.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A10. Inner loop depends on the outer",
      content: `How many times does the body run?
*Thân vòng lặp chạy bao nhiêu lần?*

Python:
\`\`\`
for i in range(3):
    for j in range(i):
        print(i, j)
\`\`\`
C++:
\`\`\`
for (int i = 0; i < 3; i++) {
    for (int j = 0; j < i; j++) {
        cout << i << " " << j << endl;
    }
}
\`\`\``,
      options: [
        { text: "3", isCorrect: true },
        { text: "6", isCorrect: false },
        { text: "9", isCorrect: false },
        { text: "2", isCorrect: false },
      ],
      explanation:
        "The inner count CHANGES each round: i = 0 gives 0 runs, i = 1 gives 1, i = 2 gives 2 — total 0 + 1 + 2 = 3. Multiplying (3 × 3 = 9 or 3 × 2 = 6) only works when the inner loop is the same every time.\n*Số lần vòng trong THAY ĐỔI theo từng lượt: i = 0 chạy 0 lần, i = 1 chạy 1, i = 2 chạy 2 — tổng 0 + 1 + 2 = 3. Phép nhân (3 × 3 = 9 hay 3 × 2 = 6) chỉ đúng khi vòng trong giống nhau mỗi lượt.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A11. A loop inside a loop",
      content: `How many times does the body (the print) run?
*Thân vòng lặp (lệnh in) chạy bao nhiêu lần?*

Python:
\`\`\`
for i in range(3):
    for j in range(2):
        print(i, j)
\`\`\`
C++:
\`\`\`
for (int i = 0; i < 3; i++) {
    for (int j = 0; j < 2; j++) {
        cout << i << " " << j << endl;
    }
}
\`\`\``,
      options: [
        { text: "6", isCorrect: true },
        { text: "5", isCorrect: false },
        { text: "3", isCorrect: false },
        { text: "8", isCorrect: false },
      ],
      explanation:
        "The inner loop runs COMPLETELY for every single pass of the outer loop: 3 × 2 = 6. Nested loops MULTIPLY, they do not add (5 comes from 3 + 2).\n*Vòng trong chạy TRỌN VẸN cho mỗi lượt của vòng ngoài: 3 × 2 = 6. Vòng lặp lồng nhau NHÂN với nhau, không cộng (5 là do tính 3 + 2).*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A12. Building a string in front",
      content: `What is \`s\` after this loop?
*\`s\` là gì sau vòng lặp này?*

Python:
\`\`\`
s = ""
for ch in "abc":
    s = ch + s
\`\`\`
C++:
\`\`\`
string s = "";
for (char ch : string("abc")) {
    s = string(1, ch) + s;
}
\`\`\``,
      options: [
        { text: '"cba"', isCorrect: true },
        { text: '"abc"', isCorrect: false },
        { text: '"abcabc"', isCorrect: false },
        { text: "Error / Lỗi", isCorrect: false },
      ],
      explanation:
        "`ch + s` puts each NEW character in FRONT of what was built so far: a → ba → cba. Prepending in a loop reverses the order; appending (`s + ch`) would keep it. Where you add matters as much as what you add.\n*`ch + s` đặt mỗi ký tự MỚI ở TRƯỚC phần đã ghép: a → ba → cba. Thêm vào đầu trong vòng lặp sẽ đảo thứ tự; thêm vào cuối (`s + ch`) thì giữ nguyên. Thêm vào ĐÂU quan trọng ngang với thêm CÁI GÌ.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A13. Overwriting instead of adding",
      content: `The inputs are 4, 7, 2. The student wanted the SUM but wrote \`total = x\`. What is printed?
*Đầu vào là 4, 7, 2. Học sinh muốn tính TỔNG nhưng viết \`total = x\`. In ra gì?*

Python:
\`\`\`
total = 0
for i in range(3):
    x = int(input())
    total = x
print(total)
\`\`\`
C++:
\`\`\`
int total = 0;
for (int i = 0; i < 3; i++) {
    int x;
    cin >> x;
    total = x;
}
cout << total;
\`\`\``,
      options: [
        { text: "2", isCorrect: true },
        { text: "13", isCorrect: false },
        { text: "4", isCorrect: false },
        { text: "0", isCorrect: false },
      ],
      explanation:
        "`total = x` REPLACES the stored value each time, so only the last input (2) survives. Accumulating needs the old value on the right side: `total = total + x`.\n*`total = x` THAY THẾ giá trị đã lưu mỗi lần, nên chỉ đầu vào cuối (2) còn lại. Muốn tích lũy phải có giá trị cũ ở vế phải: `total = total + x`.*",
      weight: 2,
    },

    // --- Functions ---
    {
      type: "single_select",
      title: "A14. Argument order matters",
      content: `What is \`sub(10, 3)\`?
*\`sub(10, 3)\` bằng bao nhiêu?*

Python:
\`\`\`
def sub(a, b):
    return a - b
\`\`\`
C++:
\`\`\`
int sub(int a, int b) {
    return a - b;
}
\`\`\``,
      options: [
        { text: "7", isCorrect: true },
        { text: "-7", isCorrect: false },
        { text: "13", isCorrect: false },
        { text: "3", isCorrect: false },
      ],
      explanation:
        "Arguments fill parameters IN ORDER: a = 10, b = 3, so the result is 10 - 3. Swapping the call to `sub(3, 10)` would give -7 — position is meaning.\n*Đối số điền vào tham số THEO THỨ TỰ: a = 10, b = 3, nên kết quả là 10 - 3. Gọi ngược `sub(3, 10)` sẽ cho -7 — vị trí chính là ý nghĩa.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A15. A variable inside a function",
      content: `What does this program print?
*Chương trình này in ra gì?*

Python:
\`\`\`
x = 10

def f():
    x = 5

f()
print(x)
\`\`\`
C++:
\`\`\`
int x = 10;

void f() {
    int x = 5;
}

int main() {
    f();
    cout << x;
}
\`\`\``,
      options: [
        { text: "10", isCorrect: true },
        { text: "5", isCorrect: false },
        { text: "Error / Lỗi", isCorrect: false },
        { text: "15", isCorrect: false },
      ],
      explanation:
        "The `x` inside the function is a NEW, local variable that exists only while the function runs — it does not touch the outer `x`. To change the outer value, return the new value and assign it.\n*`x` bên trong hàm là một biến MỚI, cục bộ, chỉ tồn tại khi hàm chạy — nó không đụng tới `x` bên ngoài. Muốn đổi giá trị bên ngoài, hãy trả về giá trị mới và gán lại.*",
      weight: 2,
    },

    // --- Lists & strings ---
    {
      type: "single_select",
      title: "A16. Index or value?",
      content: `\`items\` is \`[10, 20, 30]\`. What is \`total\` after the loop?
*\`items\` là \`[10, 20, 30]\`. Sau vòng lặp, \`total\` bằng bao nhiêu?*

Python:
\`\`\`
total = 0
for i in range(len(items)):
    total = total + i
\`\`\`
C++:
\`\`\`
int total = 0;
for (int i = 0; i < items.size(); i++) {
    total = total + i;
}
\`\`\``,
      options: [
        { text: "3", isCorrect: true },
        { text: "60", isCorrect: false },
        { text: "63", isCorrect: false },
        { text: "0", isCorrect: false },
      ],
      explanation:
        "`i` is the INDEX (0, 1, 2), not the element — the loop never reads the list, so it sums 0 + 1 + 2 = 3. Summing the values needs `items[i]` (or loop over the elements directly).\n*`i` là CHỈ SỐ (0, 1, 2), không phải phần tử — vòng lặp không hề đọc danh sách, nên nó cộng 0 + 1 + 2 = 3. Muốn cộng giá trị phải dùng `items[i]` (hoặc lặp trực tiếp qua các phần tử).*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A17. Adding text digits",
      content:
        'The TEXT values `"5"` and `"3"` (strings, not numbers) are joined with `+`. What is the result?\n*Hai giá trị VĂN BẢN `"5"` và `"3"` (chuỗi, không phải số) được nối bằng `+`. Kết quả là gì?*',
      options: [
        { text: '"53"', isCorrect: true },
        { text: "8", isCorrect: false },
        { text: '"8"', isCorrect: false },
        { text: "Error / Lỗi", isCorrect: false },
      ],
      explanation:
        "`+` on strings GLUES them; it never does math on their contents. This is why input read as text must be converted (`int(...)` / `stoi`) before adding — otherwise 5 + 3 becomes 53.\n*`+` trên chuỗi là DÁN lại với nhau; nó không bao giờ tính toán nội dung. Vì vậy đầu vào đọc dạng chữ phải được chuyển (`int(...)` / `stoi`) trước khi cộng — nếu không 5 + 3 thành 53.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A18. The last character",
      content:
        'If `s = "code"`, what is `s[len(s) - 1]` (C++: `s[s.size() - 1]`)?\n*Nếu `s = "code"`, `s[len(s) - 1]` (C++: `s[s.size() - 1]`) là gì?*',
      options: [
        { text: "e", isCorrect: true },
        { text: "d", isCorrect: false },
        { text: "c", isCorrect: false },
        { text: "Error / Lỗi", isCorrect: false },
      ],
      explanation:
        "Length is 4 but indexes run 0..3, so `length - 1` is the last character. This formula works in both languages; Python additionally allows the shortcut `s[-1]`.\n*Độ dài là 4 nhưng chỉ số chạy 0..3, nên `length - 1` là ký tự cuối. Công thức này đúng ở cả hai ngôn ngữ; Python còn cho phép viết tắt `s[-1]`.*",
      weight: 2,
    },
    {
      type: "single_select",
      title: 'A19. Is "cat" inside?',
      content:
        'Checking whether `"concatenate"` contains `"cat"` — Python `"cat" in "concatenate"`, C++ `s.find("cat") != string::npos`. What is the result?\n*Kiểm tra `"concatenate"` có chứa `"cat"` không — Python `"cat" in "concatenate"`, C++ `s.find("cat") != string::npos`. Kết quả là gì?*',
      options: [
        { text: "true", isCorrect: true },
        { text: "false", isCorrect: false },
        { text: "Error / Lỗi", isCorrect: false },
        { text: '"cat"', isCorrect: false },
      ],
      explanation:
        "A substring counts ANYWHERE inside, not only at the start: con-CAT-enate contains it at index 3. `in` gives true/false directly; C++'s `find` gives the position (or `npos` when absent).\n*Chuỗi con được tính ở BẤT KỲ vị trí nào, không chỉ ở đầu: con-CAT-enate chứa nó ở chỉ số 3. `in` cho thẳng true/false; `find` của C++ cho vị trí (hoặc `npos` nếu không có).*",
      weight: 2,
    },
    {
      type: "single_select",
      title: "A20. Same key twice",
      content: `What does the dictionary / map hold after these two lines?
*Dictionary / map chứa gì sau hai dòng này?*

Python:
\`\`\`
ages["An"] = 13
ages["An"] = 15
\`\`\`
C++:
\`\`\`
ages["An"] = 13;
ages["An"] = 15;
\`\`\``,
      options: [
        {
          text: 'ONE entry: "An" → 15 — the second write replaced the first / MỘT mục: "An" → 15 — lần ghi thứ hai thay thế lần đầu',
          isCorrect: true,
        },
        {
          text: 'Two entries, both named "An" / Hai mục cùng tên "An"',
          isCorrect: false,
        },
        {
          text: 'ONE entry: "An" → 13 / MỘT mục: "An" → 13',
          isCorrect: false,
        },
        {
          text: "Error: the key already exists / Lỗi: khóa đã tồn tại",
          isCorrect: false,
        },
      ],
      explanation:
        'Keys are UNIQUE: writing to an existing key updates its value, it never adds a second entry. That makes dictionaries perfect for "latest value per name" — and dangerous when you meant to keep both.\n*Khóa là DUY NHẤT: ghi vào khóa đã có sẽ cập nhật giá trị, không bao giờ thêm mục thứ hai. Điều đó khiến dictionary hoàn hảo cho "giá trị mới nhất theo tên" — và nguy hiểm khi bạn định giữ cả hai.*',
      weight: 2,
    },

    // ==================== PART B — SHORT CODING ====================
    // B1–B7 easy (weight 4), B8–B10 medium (weight 6). Answer in Python OR C++.

    {
      type: "free_text",
      title: "B1. Double It",
      content: `Read an integer and print it multiplied by 2.
*Đọc một số nguyên và in nó nhân với 2.*

**Example Input:**
\`\`\`
7
\`\`\`

**Example Output:**
\`\`\`
14
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
print(n * 2)

// C++
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    cout << n * 2 << endl;
}`,
      explanation: `Read as an integer (not text — "7" * 2 in Python would give "77"), multiply, print.
*Đọc dạng số nguyên (không phải chữ — "7" * 2 trong Python sẽ cho "77"), nhân, in.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B2. Absolute Value",
      content: `Read an integer and print its absolute value (the number without its minus sign). Do NOT use a built-in abs function — use if/else.
*Đọc một số nguyên và in giá trị tuyệt đối của nó (số bỏ dấu trừ). KHÔNG dùng hàm abs có sẵn — dùng if/else.*

**Example Input:**
\`\`\`
-8
\`\`\`

**Example Output:**
\`\`\`
8
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
if n < 0:
    print(-n)
else:
    print(n)

// C++
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    if (n < 0) cout << -n << endl;
    else cout << n << endl;
}`,
      explanation: `Only a negative number needs flipping (-n makes it positive); zero and positives print unchanged.
*Chỉ số âm cần đổi dấu (-n làm nó dương); số 0 và số dương in nguyên.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B3. Last Digit",
      content: `Read a positive integer and print its last digit.
*Đọc một số nguyên dương và in chữ số cuối của nó.*

**Example Input:**
\`\`\`
2947
\`\`\`

**Example Output:**
\`\`\`
7
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
print(n % 10)

// C++
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    cout << n % 10 << endl;
}`,
      explanation: `The remainder of dividing by 10 IS the last digit — no string conversion needed.
*Phần dư khi chia cho 10 CHÍNH LÀ chữ số cuối — không cần chuyển sang chuỗi.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B4. Countdown",
      content: `Read a positive integer N and print the numbers from N down to 1, each on its own line.
*Đọc một số nguyên dương N và in các số từ N xuống 1, mỗi số một dòng.*

**Example Input:**
\`\`\`
3
\`\`\`

**Example Output:**
\`\`\`
3
2
1
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
for i in range(n, 0, -1):
    print(i)

// C++
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    for (int i = n; i >= 1; i--) {
        cout << i << endl;
    }
}`,
      explanation: `A loop can step downward: start at N, stop after 1 (Python's stop value 0 is excluded; C++ keeps i >= 1).
*Vòng lặp có thể đếm xuống: bắt đầu ở N, dừng sau 1 (giá trị dừng 0 của Python bị loại; C++ giữ i >= 1).*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B5. Sum of the Inputs",
      content: `Read an integer N, then N integers (each on its own line). Print their sum.
*Đọc một số nguyên N, rồi N số nguyên (mỗi số một dòng). In tổng của chúng.*

**Example Input:**
\`\`\`
3
5
1
6
\`\`\`

**Example Output:**
\`\`\`
12
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
total = 0
for i in range(n):
    total = total + int(input())
print(total)

// C++
#include <iostream>
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
    cout << total << endl;
}`,
      explanation: `Accumulator pattern: total starts at 0 and each input is ADDED (total = total + x, never total = x).
*Mẫu tích lũy: total bắt đầu từ 0 và mỗi đầu vào được CỘNG thêm (total = total + x, không bao giờ total = x).*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B6. A cube function",
      content: `Write a function \`cube\` that takes one number and RETURNS it multiplied by itself twice (n × n × n). Then read an integer, call \`cube\`, and print the result.
*Viết hàm \`cube\` nhận một số và TRẢ VỀ số đó nhân với chính nó hai lần (n × n × n). Sau đó đọc một số nguyên, gọi \`cube\`, và in kết quả.*

**Example Input:**
\`\`\`
2
\`\`\`

**Example Output:**
\`\`\`
8
\`\`\``,
      referenceAnswer: `# Python
def cube(n):
    return n * n * n

x = int(input())
print(cube(x))

// C++
#include <iostream>
using namespace std;

int cube(int n) {
    return n * n * n;
}

int main() {
    int x;
    cin >> x;
    cout << cube(x) << endl;
}`,
      explanation: `The function must RETURN the value; printing happens at the caller. A version that prints inside cube loses the return part of the rubric.
*Hàm phải TRẢ VỀ giá trị; việc in nằm ở nơi gọi. Bản in ngay trong cube sẽ mất điểm phần trả về.*`,
      weight: 4,
    },
    {
      type: "free_text",
      title: "B7. First Letter Check",
      content: `Read a word (one line, lowercase). Print \`Yes\` if it starts with the letter \`a\`, otherwise print \`No\`.
*Đọc một từ (một dòng, chữ thường). In \`Yes\` nếu nó bắt đầu bằng chữ \`a\`, ngược lại in \`No\`.*

**Example Input:**
\`\`\`
apple
\`\`\`

**Example Output:**
\`\`\`
Yes
\`\`\``,
      referenceAnswer: `# Python
word = input()
if word[0] == "a":
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
    if (word[0] == 'a') cout << "Yes" << endl;
    else cout << "No" << endl;
}`,
      explanation: `The first character is index 0; compare it with the letter a. Python's startswith("a") is also fine.
*Ký tự đầu là chỉ số 0; so sánh nó với chữ a. Dùng startswith("a") của Python cũng được.*`,
      weight: 4,
    },

    // --- Medium (weight 6) ---
    {
      type: "free_text",
      title: "B8. Smallest of N",
      content: `Read an integer N, then N integers (each on its own line). Print the smallest one. Do NOT use a built-in min function — keep track of the smallest value yourself.
*Đọc một số nguyên N, rồi N số nguyên (mỗi số một dòng). In ra số nhỏ nhất. KHÔNG dùng hàm min có sẵn — tự theo dõi giá trị nhỏ nhất.*

**Example Input:**
\`\`\`
4
7
3
9
5
\`\`\`

**Example Output:**
\`\`\`
3
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
smallest = int(input())
for i in range(n - 1):
    x = int(input())
    if x < smallest:
        smallest = x
print(smallest)

// C++
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    int smallest;
    cin >> smallest;
    for (int i = 1; i < n; i++) {
        int x;
        cin >> x;
        if (x < smallest) smallest = x;
    }
    cout << smallest << endl;
}`,
      explanation: `Running-min pattern: start smallest at the FIRST value (starting at 0 fails when all inputs are bigger than 0), replace whenever a smaller one appears.
*Mẫu tìm min dần: khởi tạo smallest bằng giá trị ĐẦU TIÊN (khởi tạo 0 sẽ sai khi mọi đầu vào lớn hơn 0), thay thế mỗi khi gặp số nhỏ hơn.*`,
      weight: 6,
    },
    {
      type: "free_text",
      title: "B9. Sum of Digits",
      content: `Read a positive integer and print the sum of its digits. Do NOT convert the number to text — use % and integer division in a loop.
*Đọc một số nguyên dương và in tổng các chữ số của nó. KHÔNG chuyển số thành chuỗi — dùng % và chia nguyên trong một vòng lặp.*

**Example Input:**
\`\`\`
472
\`\`\`

**Example Output:**
\`\`\`
13
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
total = 0
while n > 0:
    total = total + n % 10
    n = n // 10
print(total)

// C++
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    int total = 0;
    while (n > 0) {
        total = total + n % 10;
        n = n / 10;
    }
    cout << total << endl;
}`,
      explanation: `Each pass takes the last digit with % 10 and removes it with integer division by 10; the loop ends when the number is used up (n becomes 0). 472 → 2 + 7 + 4.
*Mỗi lượt lấy chữ số cuối bằng % 10 và xóa nó bằng chia nguyên cho 10; vòng lặp dừng khi số cạn (n về 0). 472 → 2 + 7 + 4.*`,
      weight: 6,
    },
    {
      type: "free_text",
      title: "B10. FizzBuzz",
      content: `Read a positive integer N. For each number from 1 to N print one line: \`FizzBuzz\` if it is divisible by both 3 and 5, \`Fizz\` if only by 3, \`Buzz\` if only by 5, otherwise the number itself.
*Đọc một số nguyên dương N. Với mỗi số từ 1 đến N in một dòng: \`FizzBuzz\` nếu chia hết cho cả 3 và 5, \`Fizz\` nếu chỉ chia hết cho 3, \`Buzz\` nếu chỉ chia hết cho 5, ngược lại in chính số đó.*

**Example Input:**
\`\`\`
5
\`\`\`

**Example Output:**
\`\`\`
1
2
Fizz
4
Buzz
\`\`\``,
      referenceAnswer: `# Python
n = int(input())
for i in range(1, n + 1):
    if i % 3 == 0 and i % 5 == 0:
        print("FizzBuzz")
    elif i % 3 == 0:
        print("Fizz")
    elif i % 5 == 0:
        print("Buzz")
    else:
        print(i)

// C++
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    for (int i = 1; i <= n; i++) {
        if (i % 3 == 0 && i % 5 == 0) cout << "FizzBuzz" << endl;
        else if (i % 3 == 0) cout << "Fizz" << endl;
        else if (i % 5 == 0) cout << "Buzz" << endl;
        else cout << i << endl;
    }
}`,
      explanation: `The both-divisible case MUST be checked first — an elif chain stops at the first match, so testing % 3 first would print Fizz for 15. Combines loops, %, and condition ordering.
*Trường hợp chia hết cho cả hai PHẢI kiểm tra trước — chuỗi elif dừng ở nhánh khớp đầu tiên, nên kiểm tra % 3 trước sẽ in Fizz cho 15. Bài này gộp vòng lặp, %, và thứ tự điều kiện.*`,
      weight: 6,
    },
  ],
};
