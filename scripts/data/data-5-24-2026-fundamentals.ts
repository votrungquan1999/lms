export default {
  courseId: "c98f8f96-916d-48e0-a67b-a161c2cf422c",
  test: {
    title: "Python Practice: Loops, Conditionals, Lists, and Functions",
    description:
      "Complete these 20 exercises (easy → medium). Use only basic concepts: input, print, if/else, for, while, lists, and functions. Avoid built-in helpers like sum(), min(), max(), sorted(), or set() unless the problem explicitly allows it.",
    showCorrectAnswerAfterSubmit: true,
    showGradeAfterSubmit: true,
  },
  questions: [
    // --- EASY ---
    {
      type: "free_text",
      title: "Sum of a List",
      content: `Write a function \`total(nums)\` that returns the sum of all integers in a list using a loop. Read a list of integers separated by spaces and print total(nums). Do not use the built-in sum().
*Viết hàm \`total(nums)\` trả về tổng tất cả số nguyên trong danh sách bằng vòng lặp. Đọc danh sách số nguyên cách nhau bởi dấu cách và in total(nums). Không dùng hàm sum() có sẵn.*

**Example Input:**
\`\`\`
4 8 -3 5 2
\`\`\`

**Example Output:**
\`\`\`
16
\`\`\``,
      weight: 5,
    },
    {
      type: "free_text",
      title: "Count Even Numbers",
      content: `Write a function \`count_even(nums)\` that returns how many numbers in the list are even. Read a list of integers and print the count.
*Viết hàm \`count_even(nums)\` trả về số lượng số chẵn trong danh sách. Đọc danh sách số nguyên và in số lượng.*

**Example Input:**
\`\`\`
1 2 4 7 8 9 10
\`\`\`

**Example Output:**
\`\`\`
4
\`\`\``,
      weight: 5,
    },
    {
      type: "free_text",
      title: "Find Max",
      content: `Write a function \`find_max(nums)\` that returns the largest number in a non-empty list. Do not use the built-in max(). Read the list and print the result.
*Viết hàm \`find_max(nums)\` trả về số lớn nhất trong danh sách không rỗng. Không dùng hàm max() có sẵn. Đọc danh sách và in kết quả.*

**Example Input:**
\`\`\`
3 17 9 25 12 25 4
\`\`\`

**Example Output:**
\`\`\`
25
\`\`\``,
      weight: 5,
    },
    {
      type: "free_text",
      title: "Multiplication Table",
      content: `Read a positive integer N. Print the multiplication table of N from 1 to 10, one line per multiplication, formatted as 'N x i = result'.
*Đọc số nguyên dương N. In bảng cửu chương của N từ 1 đến 10, mỗi phép tính một dòng, định dạng 'N x i = result'.*

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
      weight: 5,
    },
    {
      type: "free_text",
      title: "Is Prime",
      content: `Write a function \`is_prime(n)\` that returns True if n is a prime number, False otherwise. Read N from input and print 'Yes' if prime, otherwise 'No'.
*Viết hàm \`is_prime(n)\` trả về True nếu n là số nguyên tố, ngược lại trả về False. Đọc N từ input và in 'Yes' nếu là số nguyên tố, ngược lại in 'No'.*

**Example Input:**
\`\`\`
13
\`\`\`

**Example Output:**
\`\`\`
Yes
\`\`\``,
      weight: 5,
    },
    {
      type: "free_text",
      title: "Count Vowels",
      content: `Write a function \`count_vowels(s)\` that returns how many vowels (a, e, i, o, u — both lowercase and uppercase) are in the string s. Read a single line and print the count.
*Viết hàm \`count_vowels(s)\` trả về số nguyên âm (a, e, i, o, u — cả chữ thường và chữ hoa) trong chuỗi s. Đọc một dòng và in số lượng.*

**Example Input:**
\`\`\`
Hello World
\`\`\`

**Example Output:**
\`\`\`
3
\`\`\``,
      weight: 5,
    },
    {
      type: "free_text",
      title: "Reverse a List",
      content: `Write a function \`reverse_list(nums)\` that returns a new list with the elements of nums in reverse order. Do not use the built-in reversed() or list slicing (nums[::-1]). Read a list of integers and print the reversed list with elements separated by spaces.
*Viết hàm \`reverse_list(nums)\` trả về danh sách mới với các phần tử đảo ngược thứ tự. Không dùng reversed() hay slicing (nums[::-1]). Đọc danh sách số nguyên và in danh sách đảo ngược, các phần tử cách nhau bởi dấu cách.*

**Example Input:**
\`\`\`
1 2 3 4 5
\`\`\`

**Example Output:**
\`\`\`
5 4 3 2 1
\`\`\``,
      weight: 5,
    },
    {
      type: "free_text",
      title: "Leap Year",
      content: `Write a function \`is_leap(year)\` that returns True if year is a leap year. Rule: divisible by 4 AND (not divisible by 100 OR divisible by 400). Read a year and print 'Leap' or 'Not Leap'.
*Viết hàm \`is_leap(year)\` trả về True nếu năm là năm nhuận. Quy tắc: chia hết cho 4 VÀ (không chia hết cho 100 HOẶC chia hết cho 400). Đọc một năm và in 'Leap' hoặc 'Not Leap'.*

**Example Input:**
\`\`\`
2000
\`\`\`

**Example Output:**
\`\`\`
Leap
\`\`\``,
      weight: 5,
    },

    // --- MEDIUM ---
    {
      type: "free_text",
      title: "Sum of Digits (Loop)",
      content: `Write a function \`sum_digits(n)\` that returns the sum of digits of a non-negative integer n using a while loop (not recursion, not string conversion). Read N and print the result.
*Viết hàm \`sum_digits(n)\` trả về tổng các chữ số của số nguyên không âm n bằng vòng lặp while (không dùng đệ quy, không chuyển sang chuỗi). Đọc N và in kết quả.*

**Example Input:**
\`\`\`
12345
\`\`\`

**Example Output:**
\`\`\`
15
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Find Duplicates",
      content: `Read a list of integers. Print all values that appear more than once, in the order they first become duplicates. Each duplicate should be printed only once. If there are no duplicates, print 'None'.
*Đọc một danh sách số nguyên. In ra tất cả các giá trị xuất hiện nhiều hơn một lần, theo thứ tự lần đầu chúng trở thành trùng lặp. Mỗi giá trị trùng chỉ in một lần. Nếu không có giá trị trùng nào, in 'None'.*

**Example Input:**
\`\`\`
3 5 1 5 2 3 7 5 1
\`\`\`

**Example Output:**
\`\`\`
5 3 1
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Factorial (Loop)",
      content: `Write a function \`factorial(n)\` that returns n! using a for or while loop (NOT recursion). Read N and print factorial(N).
*Viết hàm \`factorial(n)\` trả về n! bằng vòng lặp for hoặc while (KHÔNG dùng đệ quy). Đọc N và in factorial(N).*

**Example Input:**
\`\`\`
6
\`\`\`

**Example Output:**
\`\`\`
720
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "FizzBuzz",
      content: `Read a positive integer N. For each number i from 1 to N, print:
- 'FizzBuzz' if i is divisible by both 3 and 5
- 'Fizz' if i is divisible by 3 only
- 'Buzz' if i is divisible by 5 only
- Otherwise, print i itself.
Each output goes on its own line.
*Đọc số nguyên dương N. Với mỗi số i từ 1 đến N, in: 'FizzBuzz' nếu i chia hết cho cả 3 và 5; 'Fizz' nếu i chỉ chia hết cho 3; 'Buzz' nếu i chỉ chia hết cho 5; ngược lại in chính i. Mỗi giá trị trên một dòng.*

**Example Input:**
\`\`\`
15
\`\`\`

**Example Output:**
\`\`\`
1
2
Fizz
4
Buzz
Fizz
7
8
Fizz
Buzz
11
Fizz
13
14
FizzBuzz
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Find Second Smallest",
      content: `Write a function \`second_smallest(nums)\` that returns the second smallest value in the list. Assume the list has at least two distinct values. Do not use sorted() or min(). Read a list of integers and print the result.
*Viết hàm \`second_smallest(nums)\` trả về giá trị nhỏ thứ hai trong danh sách. Giả sử danh sách có ít nhất hai giá trị khác nhau. Không dùng sorted() hay min(). Đọc danh sách số nguyên và in kết quả.*

**Example Input:**
\`\`\`
9 3 7 3 5 1 8
\`\`\`

**Example Output:**
\`\`\`
3
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Count Words",
      content: `Write a function \`count_words(s)\` that returns how many words are in the string s. A word is a maximal run of non-space characters. Do not use s.split(); use a loop to scan characters yourself. Read one line and print the count.
*Viết hàm \`count_words(s)\` trả về số từ trong chuỗi s. Một từ là một dãy ký tự liên tiếp không phải khoảng trắng. Không dùng s.split(); hãy duyệt từng ký tự bằng vòng lặp. Đọc một dòng và in số lượng.*

**Example Input:**
\`\`\`
  Hello   world this  is Python
\`\`\`

**Example Output:**
\`\`\`
5
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Palindrome Word",
      content: `Write a function \`is_palindrome(s)\` that returns True if the string s reads the same forwards and backwards (case-insensitive, ignore spaces). Read one line and print 'Yes' or 'No'. Do not use s[::-1].
*Viết hàm \`is_palindrome(s)\` trả về True nếu chuỗi s đọc giống nhau từ trái sang phải và ngược lại (không phân biệt hoa thường, bỏ qua khoảng trắng). Đọc một dòng và in 'Yes' hoặc 'No'. Không dùng s[::-1].*

**Example Input:**
\`\`\`
Race car
\`\`\`

**Example Output:**
\`\`\`
Yes
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Bubble Sort",
      content: `Write a function \`bubble_sort(nums)\` that sorts a list of integers in ascending order using bubble sort. Do not use sorted() or list.sort(). Read a list of integers and print the sorted list with elements separated by spaces.
*Viết hàm \`bubble_sort(nums)\` sắp xếp danh sách số nguyên theo thứ tự tăng dần bằng thuật toán bubble sort. Không dùng sorted() hay list.sort(). Đọc danh sách số nguyên và in danh sách đã sắp xếp, các phần tử cách nhau bởi dấu cách.*

**Example Input:**
\`\`\`
5 2 9 1 5 6 3
\`\`\`

**Example Output:**
\`\`\`
1 2 3 5 5 6 9
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Merge Two Sorted Lists",
      content: `Write a function \`merge(a, b)\` that takes two lists of integers, each already sorted in ascending order, and returns a single merged sorted list. You must merge by comparing elements (do not concatenate and sort). Read the two lists on two separate lines and print the merged list.
*Viết hàm \`merge(a, b)\` nhận vào hai danh sách số nguyên đã được sắp xếp tăng dần, và trả về một danh sách đã ghép và vẫn được sắp xếp. Phải ghép bằng cách so sánh từng phần tử (không nối hai danh sách rồi sắp xếp lại). Đọc hai danh sách trên hai dòng và in danh sách đã ghép.*

**Example Input:**
\`\`\`
1 4 7 10
2 3 8 9 12
\`\`\`

**Example Output:**
\`\`\`
1 2 3 4 7 8 9 10 12
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Compound Interest",
      content: `Write a function \`compound(principal, rate, years)\` that returns the final amount after applying yearly compound interest. Formula: amount = principal * (1 + rate) ** years. Read principal (float), rate (float, e.g. 0.05 for 5%), and years (int) on three separate lines. Print the final amount rounded to 2 decimal places.
*Viết hàm \`compound(principal, rate, years)\` trả về số tiền cuối cùng sau khi áp dụng lãi kép theo năm. Công thức: amount = principal * (1 + rate) ** years. Đọc principal (float), rate (float, ví dụ 0.05 = 5%), và years (int) trên ba dòng. In số tiền cuối làm tròn đến 2 chữ số thập phân.*

**Example Input:**
\`\`\`
1000
0.05
10
\`\`\`

**Example Output:**
\`\`\`
1628.89
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Letter Grades",
      content: `Write a function \`letter_grade(score)\` that returns:
- 'A' for score >= 90
- 'B' for 80–89
- 'C' for 70–79
- 'D' for 60–69
- 'F' for below 60
Read a list of integer scores separated by spaces and print one letter grade per score, separated by spaces.
*Viết hàm \`letter_grade(score)\` trả về: 'A' cho >= 90; 'B' cho 80–89; 'C' cho 70–79; 'D' cho 60–69; 'F' cho dưới 60. Đọc một danh sách điểm số nguyên cách nhau bởi dấu cách và in một chữ điểm cho mỗi số, cách nhau bởi dấu cách.*

**Example Input:**
\`\`\`
95 72 58 84 67 100
\`\`\`

**Example Output:**
\`\`\`
A C F B D A
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text",
      title: "Simple Banking System",
      content: `Simulate a simple bank account using functions. The account starts with a balance of 0. You will read a series of commands, one per line, until the command 'EXIT' is read. Supported commands:

- \`DEPOSIT <amount>\` — add amount to balance. Print 'Deposited <amount>. Balance: <balance>'.
- \`WITHDRAW <amount>\` — subtract amount from balance ONLY if balance is enough. If not enough, print 'Insufficient funds. Balance: <balance>' and do not change the balance. Otherwise print 'Withdrew <amount>. Balance: <balance>'.
- \`BALANCE\` — print 'Balance: <balance>'.
- \`EXIT\` — print 'Goodbye. Final balance: <balance>' and stop.

Use separate functions for deposit, withdraw, and balance. Amounts are positive integers. Use a loop with input() to read commands.

*Mô phỏng một tài khoản ngân hàng đơn giản bằng các hàm. Tài khoản bắt đầu với số dư bằng 0. Đọc lần lượt các lệnh, mỗi lệnh một dòng, cho đến khi gặp 'EXIT'. Các lệnh hỗ trợ: \`DEPOSIT <amount>\` cộng tiền vào số dư; \`WITHDRAW <amount>\` rút tiền nếu đủ, nếu không đủ in 'Insufficient funds'; \`BALANCE\` in số dư; \`EXIT\` in 'Goodbye. Final balance: <balance>' và dừng. Dùng các hàm riêng cho deposit, withdraw, balance. Số tiền là số nguyên dương. Dùng vòng lặp với input() để đọc lệnh.*

**Example Input:**
\`\`\`
DEPOSIT 100
DEPOSIT 50
WITHDRAW 30
BALANCE
WITHDRAW 200
WITHDRAW 100
EXIT
\`\`\`

**Example Output:**
\`\`\`
Deposited 100. Balance: 100
Deposited 50. Balance: 150
Withdrew 30. Balance: 120
Balance: 120
Insufficient funds. Balance: 120
Withdrew 100. Balance: 20
Goodbye. Final balance: 20
\`\`\``,
      weight: 15,
    },
  ],
};
